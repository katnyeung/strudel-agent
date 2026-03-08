/**
 * Neo4j Client — State-Centric Musical Memory Graph
 *
 * VoiceState nodes represent voice combinations (e.g. [bass, hat, kick]).
 * The agent queries these to answer: "given my current voices, what voice
 * should I add/remove to reach a high-rated state?"
 *
 * No TRANSITION edges — the graph value is array containment queries
 * across VoiceState nodes, not edge traversal.
 */

import type {
  VoiceStateNode, SkillNode,
  MoveInsightNode, EvolutionRecipeNode,
  TransitionCandidate,
  VoiceSuggestion, VoiceStateStats,
  PopularVoiceState,
} from './graph-types.js';

// ─── Neo4j driver import (lazy) ───────────────────

let neo4j: any = null;
let driver: any = null;
let dbName: string | undefined = undefined;

export interface Neo4jConfig {
  uri: string;       // bolt+s://xxxx.databases.neo4j.io
  user: string;      // neo4j
  password: string;
}

// ═══════════════════════════════════════════════════
// Connection
// ═══════════════════════════════════════════════════

export async function connectNeo4j(config?: Neo4jConfig): Promise<void> {
  const uri = config?.uri ?? process.env.NEO4J_URI;
  const user = config?.user ?? process.env.NEO4J_USERNAME ?? process.env.NEO4J_USER ?? 'neo4j';
  const password = config?.password ?? process.env.NEO4J_PASSWORD;
  const database = process.env.NEO4J_DATABASE || undefined;

  if (!uri || !password) {
    console.log('[neo4j] NEO4J_URI/NEO4J_PASSWORD not set — graph memory disabled');
    return;
  }

  console.log(`[neo4j] connecting to ${uri} as user="${user}" db="${database ?? 'default'}" password="${password.slice(0, 3)}...(${password.length} chars)"`);

  try {
    neo4j = (await import('neo4j-driver')).default;
    driver = neo4j.driver(
      uri,
      neo4j.auth.basic(user, password),
    );
    await driver.verifyConnectivity();
    dbName = database;
    console.log('[neo4j] connected to', uri, database ? `(db: ${database})` : '');
  } catch (e: any) {
    console.error('[neo4j] connection failed:', e.message);
    console.error('[neo4j] details:', { uri, user, database, passwordLength: password.length });
    if (e.code) console.error('[neo4j] error code:', e.code);
    driver = null;
  }
}

export async function disconnectNeo4j(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
    console.log('[neo4j] disconnected');
  }
}

export function isConnected(): boolean {
  return driver !== null;
}

// Helper: run a query
async function run(cypher: string, params: Record<string, any> = {}): Promise<any[]> {
  if (!driver) throw new Error('Neo4j not connected');
  const session = driver.session(dbName ? { database: dbName } : undefined);
  try {
    const result = await session.run(cypher, params);
    return result.records.map((r: any) => r.toObject());
  } finally {
    await session.close();
  }
}

/** Safely convert neo4j Integer to JS number */
function toNumber(val: any): number {
  if (val == null) return 0;
  if (typeof val === 'object' && typeof val.toNumber === 'function') return val.toNumber();
  return typeof val === 'number' ? val : 0;
}

// ═══════════════════════════════════════════════════
// Schema Setup
// ═══════════════════════════════════════════════════

export async function setupSchema(): Promise<void> {
  console.log('[neo4j] setting up schema...');

  const constraints = [
    'CREATE CONSTRAINT voice_state_id IF NOT EXISTS FOR (vs:VoiceState) REQUIRE vs.id IS UNIQUE',
    'CREATE CONSTRAINT skill_id IF NOT EXISTS FOR (s:Skill) REQUIRE s.id IS UNIQUE',
    'CREATE CONSTRAINT move_insight_id IF NOT EXISTS FOR (mi:MoveInsight) REQUIRE mi.id IS UNIQUE',
    'CREATE CONSTRAINT evolution_recipe_id IF NOT EXISTS FOR (er:EvolutionRecipe) REQUIRE er.id IS UNIQUE',
  ];

  const indexes = [
    'CREATE INDEX voice_state_skill IF NOT EXISTS FOR (vs:VoiceState) ON (vs.skill_id)',
    'CREATE INDEX voice_state_visits IF NOT EXISTS FOR (vs:VoiceState) ON (vs.total_visits)',
    'CREATE INDEX transition_move IF NOT EXISTS FOR ()-[t:TRANSITION]-() ON (t.move_type)',
  ];

  for (const q of [...constraints, ...indexes]) {
    try {
      await run(q);
    } catch (e: any) {
      if (!e.message?.includes('already exists')) {
        console.warn('[neo4j] schema warning:', e.message);
      }
    }
  }

  console.log('[neo4j] schema ready');
}

// ═══════════════════════════════════════════════════
// Write: VoiceState
// ═══════════════════════════════════════════════════

/**
 * Upsert a VoiceState node. Uses running averages.
 */
export async function writeVoiceState(data: {
  id: string;
  skill_id: string;
  voices: string[];
  voice_types: string[];
  has_melody: boolean;
  has_bass: boolean;
  has_chords: boolean;
  rating: number | null;
  play_secs: number;
  timestamp: string;
}): Promise<void> {
  await run(`
    MERGE (vs:VoiceState {id: $id})
    ON CREATE SET
      vs.skill_id = $skillId,
      vs.voices = $voices,
      vs.voice_count = $voiceCount,
      vs.voice_types = $voiceTypes,
      vs.has_melody = $hasMelody,
      vs.has_bass = $hasBass,
      vs.has_chords = $hasChords,
      vs.total_visits = 1,
      vs.avg_rating = $rating,
      vs.best_rating = $rating,
      vs.avg_play_secs = $playSecs,
      vs.first_seen = datetime($timestamp),
      vs.last_seen = datetime($timestamp)
    ON MATCH SET
      vs.total_visits = vs.total_visits + 1,
      vs.avg_rating = CASE
        WHEN $rating IS NOT NULL AND vs.avg_rating IS NOT NULL
          THEN (vs.avg_rating * (vs.total_visits - 1) + $rating) / vs.total_visits
        WHEN $rating IS NOT NULL THEN $rating
        ELSE vs.avg_rating
      END,
      vs.best_rating = CASE
        WHEN $rating IS NOT NULL AND (vs.best_rating IS NULL OR $rating > vs.best_rating)
          THEN $rating
        ELSE vs.best_rating
      END,
      vs.avg_play_secs = (vs.avg_play_secs * (vs.total_visits - 1) + $playSecs) / vs.total_visits,
      vs.last_seen = datetime($timestamp)
    WITH vs
    MERGE (s:Skill {id: $skillId})
    MERGE (s)-[:HAS_STATE]->(vs)
  `, {
    id: data.id,
    skillId: data.skill_id,
    voices: data.voices,
    voiceCount: data.voices.length,
    voiceTypes: data.voice_types,
    hasMelody: data.has_melody,
    hasBass: data.has_bass,
    hasChords: data.has_chords,
    rating: data.rating,
    playSecs: data.play_secs,
    timestamp: data.timestamp,
  });
}

// ═══════════════════════════════════════════════════
// Write: Transition (only when voice set changed — no self-loops)
// ═══════════════════════════════════════════════════

/**
 * Upsert a TRANSITION edge between two VoiceState nodes.
 * Only called when from_id !== to_id (voice set actually changed).
 */
export async function writeTransition(data: {
  from_id: string;
  to_id: string;
  move_type: string;
  rating_before: number | null;
  rating_after: number | null;
  timestamp: string;
}): Promise<void> {
  const improvement = (data.rating_before != null && data.rating_after != null)
    ? data.rating_after - data.rating_before : null;
  const improved = improvement != null && improvement > 0 ? 1 : 0;

  await run(`
    MATCH (from:VoiceState {id: $fromId})
    MATCH (to:VoiceState {id: $toId})
    MERGE (from)-[t:TRANSITION {move_type: $moveType}]->(to)
    ON CREATE SET
      t.count = 1,
      t.avg_rating_before = $ratingBefore,
      t.avg_rating_after = $ratingAfter,
      t.avg_improvement = $improvement,
      t.success_rate = $improved,
      t.last_seen = datetime($timestamp)
    ON MATCH SET
      t.count = t.count + 1,
      t.avg_rating_before = CASE
        WHEN $ratingBefore IS NOT NULL AND t.avg_rating_before IS NOT NULL
          THEN (t.avg_rating_before * (t.count - 1) + $ratingBefore) / t.count
        WHEN $ratingBefore IS NOT NULL THEN $ratingBefore
        ELSE t.avg_rating_before
      END,
      t.avg_rating_after = CASE
        WHEN $ratingAfter IS NOT NULL AND t.avg_rating_after IS NOT NULL
          THEN (t.avg_rating_after * (t.count - 1) + $ratingAfter) / t.count
        WHEN $ratingAfter IS NOT NULL THEN $ratingAfter
        ELSE t.avg_rating_after
      END,
      t.avg_improvement = CASE
        WHEN $improvement IS NOT NULL AND t.avg_improvement IS NOT NULL
          THEN (t.avg_improvement * (t.count - 1) + $improvement) / t.count
        WHEN $improvement IS NOT NULL THEN $improvement
        ELSE t.avg_improvement
      END,
      t.success_rate = CASE
        WHEN $improvement IS NOT NULL
          THEN (t.success_rate * (t.count - 1) + $improved) / t.count
        ELSE t.success_rate
      END,
      t.last_seen = datetime($timestamp)
  `, {
    fromId: data.from_id,
    toId: data.to_id,
    moveType: data.move_type,
    ratingBefore: data.rating_before,
    ratingAfter: data.rating_after,
    improvement,
    improved,
    timestamp: data.timestamp,
  });
}

// ═══════════════════════════════════════════════════
// Read: Agent queries — transitions from current state
// ═══════════════════════════════════════════════════

/**
 * "From my current [kick, bass, hat], what voice-changing moves worked well?"
 * Returns transitions FROM the current state ranked by success_rate × improvement.
 */
export async function getBestTransitions(
  skillId: string,
  currentVoices: string[],
  minCount: number = 2,
  limit: number = 5,
): Promise<TransitionCandidate[]> {
  const sorted = [...currentVoices].sort();
  const stateId = `vs_${skillId}_${sorted.join('-')}`;

  const results = await run(`
    MATCH (from:VoiceState {id: $stateId})-[t:TRANSITION]->(to:VoiceState)
    WHERE t.count >= $minCount
    RETURN to.voices AS to_voices,
           t.move_type AS move_type,
           t.count AS count,
           t.avg_improvement AS avg_improvement,
           t.success_rate AS success_rate,
           t.avg_rating_after AS avg_rating_after
    ORDER BY t.success_rate * COALESCE(t.avg_improvement, 0) DESC
    LIMIT toInteger($limit)
  `, { stateId, minCount, limit });

  return results.map(r => ({
    to_voices: r.to_voices,
    move_type: r.move_type,
    count: toNumber(r.count),
    avg_improvement: r.avg_improvement,
    success_rate: r.success_rate ?? 0,
    avg_rating_after: r.avg_rating_after,
  }));
}

// ═══════════════════════════════════════════════════
// Read: Agent queries (voice suggestions via array containment)
// ═══════════════════════════════════════════════════

/**
 * "I have [hat, kick]. What voice should I add to reach a high-rated state?"
 * Finds VoiceState nodes that contain all current voices PLUS extras, ranked by rating.
 */
export async function getSuggestedVoicesToAdd(
  skillId: string,
  currentVoices: string[],
  minVisits: number = 2,
  limit: number = 5,
): Promise<VoiceSuggestion[]> {
  if (currentVoices.length === 0) return [];

  const results = await run(`
    MATCH (vs:VoiceState {skill_id: $skillId})
    WHERE vs.total_visits >= $minVisits
      AND vs.voice_count > size($currentVoices)
      AND ALL(v IN $currentVoices WHERE v IN vs.voices)
      AND vs.avg_rating IS NOT NULL
    WITH vs, [v IN vs.voices WHERE NOT v IN $currentVoices] AS added_voices
    UNWIND added_voices AS candidate
    RETURN candidate AS voice_name,
           count(*) AS appearances,
           avg(vs.avg_rating) AS avg_rating,
           max(vs.best_rating) AS best_rating
    ORDER BY avg_rating DESC, appearances DESC
    LIMIT toInteger($limit)
  `, { skillId, currentVoices, minVisits, limit });

  return results.map(r => ({
    voice_name: r.voice_name,
    appearances: toNumber(r.appearances),
    avg_rating: r.avg_rating,
    best_rating: r.best_rating,
  }));
}

/**
 * "I have [hat, kick, bass, stab]. What voice could I remove to improve rating?"
 * Finds VoiceState nodes that are subsets of current voices with better ratings.
 */
export async function getSuggestedVoicesToRemove(
  skillId: string,
  currentVoices: string[],
  minVisits: number = 2,
  limit: number = 5,
): Promise<VoiceSuggestion[]> {
  if (currentVoices.length <= 1) return [];

  const results = await run(`
    MATCH (vs:VoiceState {skill_id: $skillId})
    WHERE vs.total_visits >= $minVisits
      AND vs.voice_count < size($currentVoices)
      AND ALL(v IN vs.voices WHERE v IN $currentVoices)
      AND vs.avg_rating IS NOT NULL
    WITH vs, [v IN $currentVoices WHERE NOT v IN vs.voices] AS removed_voices
    UNWIND removed_voices AS candidate
    RETURN candidate AS voice_name,
           count(*) AS appearances,
           avg(vs.avg_rating) AS avg_rating,
           max(vs.best_rating) AS best_rating
    ORDER BY avg_rating DESC, appearances DESC
    LIMIT toInteger($limit)
  `, { skillId, currentVoices, minVisits, limit });

  return results.map(r => ({
    voice_name: r.voice_name,
    appearances: toNumber(r.appearances),
    avg_rating: r.avg_rating,
    best_rating: r.best_rating,
  }));
}

/**
 * Stats for the current voice state.
 */
export async function getVoiceStateStats(
  skillId: string,
  currentVoices: string[],
): Promise<VoiceStateStats | null> {
  const sorted = [...currentVoices].sort();
  const stateId = `vs_${skillId}_${sorted.join('-')}`;

  const results = await run(`
    MATCH (vs:VoiceState {id: $stateId})
    RETURN vs.id as id, vs.voices as voices,
           vs.total_visits as total_visits, vs.avg_rating as avg_rating,
           vs.best_rating as best_rating, vs.avg_play_secs as avg_play_secs
  `, { stateId });

  if (results.length === 0) return null;
  const r = results[0];
  return {
    id: r.id,
    voices: r.voices,
    total_visits: toNumber(r.total_visits),
    avg_rating: r.avg_rating,
    best_rating: r.best_rating,
    avg_play_secs: r.avg_play_secs ?? 0,
  };
}

// ═══════════════════════════════════════════════════
// Read: Context / Review queries
// ═══════════════════════════════════════════════════

/**
 * Most-visited voice states for a skill.
 */
export async function getPopularVoiceStates(
  skillId: string,
  minVisits: number = 3,
  limit: number = 10,
): Promise<PopularVoiceState[]> {
  const results = await run(`
    MATCH (vs:VoiceState {skill_id: $skillId})
    WHERE vs.total_visits >= $minVisits
    RETURN vs.id as id, vs.voices as voices, vs.voice_count as voice_count,
           vs.total_visits as total_visits, vs.avg_rating as avg_rating,
           vs.best_rating as best_rating
    ORDER BY vs.total_visits DESC
    LIMIT toInteger($limit)
  `, { skillId, minVisits, limit });

  return results.map(r => ({
    id: r.id,
    voices: r.voices,
    voice_count: toNumber(r.voice_count),
    total_visits: toNumber(r.total_visits),
    avg_rating: r.avg_rating,
    best_rating: r.best_rating,
  }));
}

/**
 * Aggregate stats + top states for a skill (used by review).
 */
export async function getSkillVoiceStateStats(skillId: string): Promise<{
  state_count: number;
  avg_rating: number | null;
  total_visits: number;
  top_states: Array<{ voices: string[]; visits: number; avg_rating: number | null }>;
}> {
  const statsResult = await run(`
    MATCH (vs:VoiceState {skill_id: $skillId})
    RETURN count(vs) as state_count,
           avg(vs.avg_rating) as avg_rating,
           sum(vs.total_visits) as total_visits
  `, { skillId });

  const topResult = await run(`
    MATCH (vs:VoiceState {skill_id: $skillId})
    RETURN vs.voices as voices, vs.total_visits as visits, vs.avg_rating as avg_rating
    ORDER BY vs.total_visits DESC
    LIMIT 10
  `, { skillId });

  const s = statsResult[0] ?? {};
  return {
    state_count: toNumber(s.state_count),
    avg_rating: s.avg_rating,
    total_visits: toNumber(s.total_visits),
    top_states: topResult.map(r => ({
      voices: r.voices,
      visits: toNumber(r.visits),
      avg_rating: r.avg_rating,
    })),
  };
}

/** All distinct skill IDs in the graph */
export async function getDistinctSkillIds(): Promise<string[]> {
  const results = await run(`
    MATCH (s:Skill)
    RETURN s.id as id
    ORDER BY s.id
  `);
  return results.map(r => r.id);
}

// ═══════════════════════════════════════════════════
// Write: LLM Review Nodes
// ═══════════════════════════════════════════════════

export async function writeMoveInsight(data: MoveInsightNode): Promise<void> {
  await run(`
    MERGE (mi:MoveInsight {id: $id})
    SET mi.skill_id = $skillId,
        mi.review_date = date($reviewDate),
        mi.move_groups = $moveGroups,
        mi.top_insight = $topInsight,
        mi.raw_response = $rawResponse
    WITH mi
    MATCH (s:Skill {id: $skillId})
    MERGE (mi)-[:REVIEWS]->(s)
  `, {
    id: data.id,
    skillId: data.skill_id,
    reviewDate: data.review_date,
    moveGroups: data.move_groups,
    topInsight: data.top_insight,
    rawResponse: data.raw_response,
  });
}

export async function writeEvolutionRecipe(data: EvolutionRecipeNode): Promise<void> {
  await run(`
    MERGE (er:EvolutionRecipe {id: $id})
    SET er.skill_id = $skillId,
        er.review_date = date($reviewDate),
        er.recipes = $recipes,
        er.best_recipe_summary = $bestRecipeSummary,
        er.raw_response = $rawResponse
    WITH er
    MATCH (s:Skill {id: $skillId})
    MERGE (er)-[:REVIEWS]->(s)
  `, {
    id: data.id,
    skillId: data.skill_id,
    reviewDate: data.review_date,
    recipes: data.recipes,
    bestRecipeSummary: data.best_recipe_summary,
    rawResponse: data.raw_response,
  });
}

// ═══════════════════════════════════════════════════
// Read: Latest Review Nodes
// ═══════════════════════════════════════════════════

export async function getLatestMoveInsight(skillId: string): Promise<MoveInsightNode | null> {
  const results = await run(`
    MATCH (mi:MoveInsight {skill_id: $skillId})
    RETURN mi.id as id, mi.skill_id as skill_id,
           toString(mi.review_date) as review_date,
           mi.move_groups as move_groups,
           mi.top_insight as top_insight,
           mi.raw_response as raw_response
    ORDER BY mi.review_date DESC
    LIMIT 1
  `, { skillId });

  if (results.length === 0) return null;
  const r = results[0];
  return {
    id: r.id, skill_id: r.skill_id, review_date: r.review_date,
    move_groups: r.move_groups, top_insight: r.top_insight, raw_response: r.raw_response,
  };
}

export async function getLatestEvolutionRecipe(skillId: string): Promise<EvolutionRecipeNode | null> {
  const results = await run(`
    MATCH (er:EvolutionRecipe {skill_id: $skillId})
    RETURN er.id as id, er.skill_id as skill_id,
           toString(er.review_date) as review_date,
           er.recipes as recipes,
           er.best_recipe_summary as best_recipe_summary,
           er.raw_response as raw_response
    ORDER BY er.review_date DESC
    LIMIT 1
  `, { skillId });

  if (results.length === 0) return null;
  const r = results[0];
  return {
    id: r.id, skill_id: r.skill_id, review_date: r.review_date,
    recipes: r.recipes, best_recipe_summary: r.best_recipe_summary, raw_response: r.raw_response,
  };
}

// ═══════════════════════════════════════════════════
// Maintenance
// ═══════════════════════════════════════════════════

/**
 * Prune voice states with very few visits.
 */
export async function pruneStaleStates(minVisits: number = 2): Promise<number> {
  const results = await run(`
    MATCH (vs:VoiceState)
    WHERE vs.total_visits < $minVisits
    WITH vs LIMIT 500
    DETACH DELETE vs
    RETURN count(*) as deleted
  `, { minVisits });

  const deleted = toNumber(results[0]?.deleted);
  console.log(`[neo4j] pruned ${deleted} stale voice states (<${minVisits} visits)`);
  return deleted;
}

/**
 * Get graph stats for monitoring.
 */
export async function getGraphStats(): Promise<Record<string, number>> {
  const results = await run(`
    OPTIONAL MATCH (vs:VoiceState) WITH count(vs) as voice_states
    OPTIONAL MATCH (s:Skill) WITH voice_states, count(s) as skills
    OPTIONAL MATCH ()-[t:TRANSITION]->() WITH voice_states, skills, count(t) as transitions
    RETURN voice_states, skills, transitions
  `);

  const r = results[0] ?? {};
  return {
    voice_states: toNumber(r.voice_states),
    transitions: toNumber(r.transitions),
    skills: toNumber(r.skills),
  };
}
