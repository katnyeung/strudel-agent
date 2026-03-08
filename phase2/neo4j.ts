/**
 * Neo4j Client — Musical Memory Graph
 *
 * Connects to Neo4j Aura and provides methods to:
 * 1. Write pattern evolution data (called by daily review)
 * 2. Query musical relationships (called by agent for smarter decisions)
 * 3. Manage indexes and constraints
 *
 * Uses the official neo4j-driver npm package.
 *
 * Setup:
 *   npm install neo4j-driver
 *   Set env vars: NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD
 */

import type {
  PatternNode, VoiceNode, SkillNode, MoveNode,
  VibeNode, SessionNode, DailyReviewNode,
  EvolvedToRel, MoveEffectiveness, VoicePairing,
  TopPattern, EvolutionPath, CrossGenreDiscovery,
} from './graph-types.js';
import {
  parseVoices, extractBpm, detectKeyAndScale,
  classifyMoveType, classifyMoveCategory,
} from './voice-parser.js';

// ─── Neo4j driver import (lazy) ───────────────────

let neo4j: any = null;
let driver: any = null;

export interface Neo4jConfig {
  uri: string;       // bolt+s://xxxx.databases.neo4j.io
  user: string;      // neo4j
  password: string;
}

// ═══════════════════════════════════════════════════
// Connection
// ═══════════════════════════════════════════════════

export async function connectNeo4j(config: Neo4jConfig): Promise<void> {
  try {
    neo4j = (await import('neo4j-driver')).default;
    driver = neo4j.driver(
      config.uri,
      neo4j.auth.basic(config.user, config.password),
    );
    // Verify connectivity
    await driver.verifyConnectivity();
    console.log('[neo4j] connected to', config.uri);
  } catch (e: any) {
    console.error('[neo4j] connection failed:', e.message);
    driver = null;
    throw e;
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
  const session = driver.session();
  try {
    const result = await session.run(cypher, params);
    return result.records.map((r: any) => r.toObject());
  } finally {
    await session.close();
  }
}

// ═══════════════════════════════════════════════════
// Schema Setup
// ═══════════════════════════════════════════════════

export async function setupSchema(): Promise<void> {
  console.log('[neo4j] setting up schema...');

  const constraints = [
    'CREATE CONSTRAINT pattern_id IF NOT EXISTS FOR (p:Pattern) REQUIRE p.id IS UNIQUE',
    'CREATE CONSTRAINT skill_id IF NOT EXISTS FOR (s:Skill) REQUIRE s.id IS UNIQUE',
    'CREATE CONSTRAINT session_id IF NOT EXISTS FOR (s:Session) REQUIRE s.id IS UNIQUE',
    'CREATE CONSTRAINT voice_id IF NOT EXISTS FOR (v:Voice) REQUIRE v.id IS UNIQUE',
    'CREATE CONSTRAINT review_id IF NOT EXISTS FOR (d:DailyReview) REQUIRE d.id IS UNIQUE',
  ];

  const indexes = [
    'CREATE INDEX pattern_skill IF NOT EXISTS FOR (p:Pattern) ON (p.skill_id)',
    'CREATE INDEX pattern_rating IF NOT EXISTS FOR (p:Pattern) ON (p.rating)',
    'CREATE INDEX pattern_date IF NOT EXISTS FOR (p:Pattern) ON (p.created_at)',
    'CREATE INDEX voice_type IF NOT EXISTS FOR (v:Voice) ON (v.type)',
    'CREATE INDEX voice_name IF NOT EXISTS FOR (v:Voice) ON (v.name)',
    'CREATE INDEX move_type IF NOT EXISTS FOR (m:Move) ON (m.type)',
  ];

  for (const q of [...constraints, ...indexes]) {
    try {
      await run(q);
    } catch (e: any) {
      // Ignore "already exists" errors
      if (!e.message?.includes('already exists')) {
        console.warn('[neo4j] schema warning:', e.message);
      }
    }
  }

  console.log('[neo4j] schema ready');
}

// ═══════════════════════════════════════════════════
// Write: Patterns & Evolution
// ═══════════════════════════════════════════════════

/**
 * Store a pattern and its voices in the graph.
 * Called by daily review when processing Neon evolution rows.
 */
export async function writePattern(data: {
  id: string;
  code: string;
  skill_id: string;
  rating: number | null;
  play_secs: number;
  created_at: string;
}): Promise<void> {
  const bpm = extractBpm(data.code);
  const { key, scale } = detectKeyAndScale(data.code);
  const voices = parseVoices(data.id, data.code);
  const voiceNames = voices.map(v => v.name);

  // Create Pattern node
  await run(`
    MERGE (p:Pattern {id: $id})
    SET p.code = $code,
        p.skill_id = $skillId,
        p.voice_count = $voiceCount,
        p.voices = $voices,
        p.has_melody = $hasMelody,
        p.has_chords = $hasChords,
        p.has_bass = $hasBass,
        p.bpm = $bpm,
        p.key = $key,
        p.scale = $scale,
        p.rating = $rating,
        p.play_secs = $playSecs,
        p.created_at = datetime($createdAt)
  `, {
    id: data.id,
    code: data.code,
    skillId: data.skill_id,
    voiceCount: voices.length,
    voices: voiceNames,
    hasMelody: voices.some(v => v.type === 'melody'),
    hasChords: voices.some(v => v.type === 'harmony'),
    hasBass: voices.some(v => v.type === 'bass'),
    bpm,
    key,
    scale,
    rating: data.rating,
    playSecs: data.play_secs,
    createdAt: data.created_at,
  });

  // Create Voice nodes + CONTAINS relationships
  for (const voice of voices) {
    await run(`
      MERGE (v:Voice {id: $id})
      SET v.name = $name,
          v.code = $code,
          v.type = $type,
          v.synth = $synth,
          v.notes = $notes,
          v.has_lpf = $hasLpf,
          v.has_room = $hasRoom,
          v.has_delay = $hasDelay,
          v.has_swing = $hasSwing,
          v.gain = $gain
      WITH v
      MATCH (p:Pattern {id: $patternId})
      MERGE (p)-[:CONTAINS]->(v)
    `, {
      id: voice.id,
      name: voice.name,
      code: voice.code,
      type: voice.type,
      synth: voice.synth,
      notes: voice.notes,
      hasLpf: voice.has_lpf,
      hasRoom: voice.has_room,
      hasDelay: voice.has_delay,
      hasSwing: voice.has_swing,
      gain: voice.gain,
      patternId: data.id,
    });
  }

  // Link to Skill
  await run(`
    MERGE (s:Skill {id: $skillId})
    WITH s
    MATCH (p:Pattern {id: $patternId})
    MERGE (s)-[:PRODUCED]->(p)
  `, { skillId: data.skill_id, patternId: data.id });
}

/**
 * Create an EVOLVED_TO relationship between two consecutive patterns.
 */
export async function writeEvolution(data: {
  from_id: string;
  to_id: string;
  reason: string;
  move_type: string;
  session_id: string;
  rating_before: number | null;
  rating_after: number | null;
}): Promise<void> {
  const ratingDelta = (data.rating_before != null && data.rating_after != null)
    ? data.rating_after - data.rating_before
    : null;

  // EVOLVED_TO relationship
  await run(`
    MATCH (p1:Pattern {id: $fromId})
    MATCH (p2:Pattern {id: $toId})
    MERGE (p1)-[e:EVOLVED_TO]->(p2)
    SET e.reason = $reason,
        e.move_type = $moveType,
        e.rating_delta = $ratingDelta,
        e.session_id = $sessionId
  `, {
    fromId: data.from_id,
    toId: data.to_id,
    reason: data.reason,
    moveType: data.move_type,
    ratingDelta: ratingDelta,
    sessionId: data.session_id,
  });

  // Move node + APPLIED_IN
  const category = classifyMoveCategory(data.move_type);
  await run(`
    MERGE (m:Move {type: $moveType})
    ON CREATE SET m.description = $reason, m.category = $category
    WITH m
    MATCH (p:Pattern {id: $toId})
    MERGE (m)-[a:APPLIED_IN]->(p)
    SET a.rating_before = $ratingBefore,
        a.rating_after = $ratingAfter,
        a.rating_delta = $ratingDelta,
        a.pattern_id = $toId
  `, {
    moveType: data.move_type,
    reason: data.reason,
    category,
    toId: data.to_id,
    ratingBefore: data.rating_before,
    ratingAfter: data.rating_after,
    ratingDelta: ratingDelta,
  });
}

/**
 * Store a vibe → skill mapping.
 */
export async function writeVibeTrigger(data: {
  vibe_text: string;
  mood: string;
  energy: string;
  keywords: string[];
  skill_id: string;
  session_id: string;
  pattern_id: string;
  rating: number | null;
}): Promise<void> {
  await run(`
    MERGE (v:Vibe {text: $text})
    SET v.mood = $mood,
        v.energy = $energy,
        v.keywords = $keywords
    WITH v
    MATCH (s:Skill {id: $skillId})
    MERGE (v)-[t:TRIGGERED]->(s)
    SET t.session_id = $sessionId,
        t.pattern_id = $patternId,
        t.rating = $rating
  `, {
    text: data.vibe_text,
    mood: data.mood,
    energy: data.energy,
    keywords: data.keywords,
    skillId: data.skill_id,
    sessionId: data.session_id,
    patternId: data.pattern_id,
    rating: data.rating,
  });
}

/**
 * Compute PAIRED_WITH relationships between voices.
 * Run this in batch during daily review, not per-evolution.
 */
export async function computeVoicePairings(skillId: string): Promise<void> {
  // Delete old pairings for this skill
  await run(`
    MATCH (v1:Voice)-[pw:PAIRED_WITH {skill_id: $skillId}]->(v2:Voice)
    DELETE pw
  `, { skillId });

  // Recompute: for every pair of voices in the same pattern
  await run(`
    MATCH (p:Pattern {skill_id: $skillId})-[:CONTAINS]->(v1:Voice)
    MATCH (p)-[:CONTAINS]->(v2:Voice)
    WHERE id(v1) < id(v2) AND p.rating IS NOT NULL
    WITH v1.name as name1, v1.code as code1,
         v2.name as name2, v2.code as code2,
         count(p) as pattern_count, avg(p.rating) as avg_rating
    WHERE pattern_count >= 2
    MERGE (v1a:Voice {name: name1})-[pw:PAIRED_WITH]->(v2a:Voice {name: name2})
    SET pw.pattern_count = pattern_count,
        pw.avg_rating = avg_rating,
        pw.skill_id = $skillId
  `, { skillId });

  console.log(`[neo4j] recomputed voice pairings for ${skillId}`);
}

// ═══════════════════════════════════════════════════
// Write: Sessions & Reviews
// ═══════════════════════════════════════════════════

export async function writeSession(data: SessionNode): Promise<void> {
  await run(`
    MERGE (s:Session {id: $id})
    SET s.started_at = datetime($startedAt),
        s.ended_at = $endedAt,
        s.duration_m = $durationM,
        s.evolutions = $evolutions,
        s.avg_rating = $avgRating
  `, {
    id: data.id,
    startedAt: data.started_at,
    endedAt: data.ended_at ? `datetime('${data.ended_at}')` : null,
    durationM: data.duration_m,
    evolutions: data.evolutions,
    avgRating: data.avg_rating,
  });
}

export async function writeDailyReview(data: DailyReviewNode): Promise<void> {
  await run(`
    CREATE (dr:DailyReview {
      id: $id,
      review_date: date($reviewDate),
      skill_id: $skillId,
      patterns_reviewed: $patternsReviewed,
      lessons: $lessons,
      skill_version_before: $vBefore,
      skill_version_after: $vAfter
    })
    WITH dr
    MATCH (s:Skill {id: $skillId})
    MERGE (dr)-[:IMPROVED]->(s)
  `, {
    id: data.id,
    reviewDate: data.review_date,
    skillId: data.skill_id,
    patternsReviewed: data.patterns_reviewed,
    lessons: data.lessons,
    vBefore: data.skill_version_before,
    vAfter: data.skill_version_after,
  });
}

// ═══════════════════════════════════════════════════
// Read: Queries for Daily Review & Agent Intelligence
// ═══════════════════════════════════════════════════

/**
 * Top-rated patterns from the last N hours.
 */
export async function getTopPatterns(hours: number = 24, limit: number = 10): Promise<TopPattern[]> {
  const results = await run(`
    MATCH (p:Pattern)
    WHERE p.created_at > datetime() - duration({hours: $hours})
      AND p.rating >= 4
    RETURN p.code as code, p.skill_id as skill_id,
           p.rating as rating, p.voices as voices,
           p.voice_count as voice_count
    ORDER BY p.rating DESC
    LIMIT $limit
  `, { hours, limit });

  return results.map(r => ({
    code: r.code, skill_id: r.skill_id,
    rating: r.rating, voices: r.voices, voice_count: r.voice_count,
  }));
}

/**
 * Worst patterns from the last N hours.
 */
export async function getWorstPatterns(hours: number = 24, limit: number = 10): Promise<TopPattern[]> {
  const results = await run(`
    MATCH (p:Pattern)
    WHERE p.created_at > datetime() - duration({hours: $hours})
      AND (p.rating <= 2 OR p.play_secs < 30)
    RETURN p.code as code, p.skill_id as skill_id,
           p.rating as rating, p.voices as voices,
           p.voice_count as voice_count
    ORDER BY p.rating ASC, p.play_secs ASC
    LIMIT $limit
  `, { hours, limit });

  return results.map(r => ({
    code: r.code, skill_id: r.skill_id,
    rating: r.rating, voices: r.voices, voice_count: r.voice_count,
  }));
}

/**
 * Most effective evolution moves over a time period.
 */
export async function getBestMoves(days: number = 7, limit: number = 10): Promise<MoveEffectiveness[]> {
  const results = await run(`
    MATCH (m:Move)-[a:APPLIED_IN]->(p:Pattern)
    WHERE p.created_at > datetime() - duration({days: $days})
      AND a.rating_delta > 0
    RETURN m.type as move_type,
           m.description as description,
           count(*) as success_count,
           avg(a.rating_delta) as avg_improvement,
           collect(DISTINCT p.skill_id) as genres
    ORDER BY success_count DESC
    LIMIT $limit
  `, { days, limit });

  return results.map(r => ({
    move_type: r.move_type,
    description: r.description,
    success_count: typeof r.success_count === 'object' ? r.success_count.toNumber() : r.success_count,
    avg_improvement: r.avg_improvement,
    genres: r.genres,
  }));
}

/**
 * Best voice pairings for a given skill.
 */
export async function getBestVoicePairings(skillId: string, limit: number = 10): Promise<VoicePairing[]> {
  const results = await run(`
    MATCH (v1:Voice)-[pw:PAIRED_WITH {skill_id: $skillId}]->(v2:Voice)
    WHERE pw.avg_rating >= 3.5
    RETURN v1.name as voice1_name, v1.code as voice1_code,
           v2.name as voice2_name, v2.code as voice2_code,
           pw.avg_rating as avg_rating, pw.pattern_count as count
    ORDER BY pw.avg_rating DESC
    LIMIT $limit
  `, { skillId, limit });

  return results.map(r => ({
    voice1_name: r.voice1_name, voice1_code: r.voice1_code,
    voice2_name: r.voice2_name, voice2_code: r.voice2_code,
    avg_rating: r.avg_rating,
    count: typeof r.count === 'object' ? r.count.toNumber() : r.count,
  }));
}

/**
 * Best evolution paths: from low-rated to high-rated patterns.
 */
export async function getBestEvolutionPaths(limit: number = 5): Promise<EvolutionPath[]> {
  const results = await run(`
    MATCH path = (start:Pattern)-[:EVOLVED_TO*1..5]->(end:Pattern)
    WHERE start.rating <= 2 AND end.rating >= 4
    RETURN start.code as start_code, start.rating as start_rating,
           end.code as end_code, end.rating as end_rating,
           length(path) as steps,
           end.rating - start.rating as improvement
    ORDER BY improvement DESC, steps ASC
    LIMIT $limit
  `, { limit });

  return results.map(r => ({
    start_code: r.start_code, start_rating: r.start_rating,
    end_code: r.end_code, end_rating: r.end_rating,
    steps: typeof r.steps === 'object' ? r.steps.toNumber() : r.steps,
    improvement: r.improvement,
  }));
}

/**
 * Cross-genre discoveries: voices that work well in multiple genres.
 */
export async function getCrossGenreDiscoveries(limit: number = 10): Promise<CrossGenreDiscovery[]> {
  const results = await run(`
    MATCH (p1:Pattern)-[:CONTAINS]->(v1:Voice)
    MATCH (p2:Pattern)-[:CONTAINS]->(v2:Voice)
    WHERE p1.skill_id <> p2.skill_id
      AND v1.code = v2.code
      AND p1.rating >= 4 AND p2.rating >= 4
    RETURN v1.name as voice_name, v1.code as voice_code,
           p1.skill_id as genre1, p2.skill_id as genre2
    LIMIT $limit
  `, { limit });

  return results.map(r => ({
    voice_name: r.voice_name, voice_code: r.voice_code,
    genre1: r.genre1, genre2: r.genre2,
  }));
}

/**
 * Under-explored moves that had good results when tried.
 * Used for "mutation budget" — try things we haven't tried much.
 */
export async function getUnderExploredMoves(skillId: string, limit: number = 5): Promise<MoveEffectiveness[]> {
  const results = await run(`
    MATCH (m:Move)-[a:APPLIED_IN]->(p:Pattern {skill_id: $skillId})
    WITH m, count(a) as attempts, avg(a.rating_delta) as avg_delta
    WHERE attempts < 5 AND avg_delta > 0.5
    RETURN m.type as move_type, m.description as description,
           attempts as success_count, avg_delta as avg_improvement,
           [$skillId] as genres
    ORDER BY avg_delta DESC
    LIMIT $limit
  `, { skillId, limit });

  return results.map(r => ({
    move_type: r.move_type,
    description: r.description,
    success_count: typeof r.success_count === 'object' ? r.success_count.toNumber() : r.success_count,
    avg_improvement: r.avg_improvement,
    genres: r.genres,
  }));
}

/**
 * What drums work well with specific chord notes?
 * This is the "note('D3 F#2') + which drums = rated 5?" query.
 */
export async function getDrumPairingsForNotes(
  notes: string[],
  limit: number = 10,
): Promise<Array<{ drum_code: string; drum_name: string; count: number; avg_rating: number }>> {
  const results = await run(`
    MATCH (p:Pattern)-[:CONTAINS]->(chord:Voice)
    WHERE chord.type IN ['harmony', 'melody']
      AND ALL(n IN $notes WHERE n IN chord.notes)
      AND p.rating >= 3
    MATCH (p)-[:CONTAINS]->(drum:Voice {type: 'drums'})
    RETURN drum.code as drum_code, drum.name as drum_name,
           count(DISTINCT p) as count, avg(p.rating) as avg_rating
    ORDER BY avg_rating DESC, count DESC
    LIMIT $limit
  `, { notes, limit });

  return results.map(r => ({
    drum_code: r.drum_code,
    drum_name: r.drum_name,
    count: typeof r.count === 'object' ? r.count.toNumber() : r.count,
    avg_rating: r.avg_rating,
  }));
}

/**
 * Best skill for a vibe keyword.
 */
export async function getBestSkillForVibe(
  keyword: string,
): Promise<Array<{ skill_id: string; count: number; avg_rating: number }>> {
  const results = await run(`
    MATCH (v:Vibe)-[t:TRIGGERED]->(s:Skill)
    WHERE $keyword IN v.keywords AND t.rating >= 3
    RETURN s.id as skill_id, count(*) as count, avg(t.rating) as avg_rating
    ORDER BY avg_rating DESC
  `, { keyword });

  return results.map(r => ({
    skill_id: r.skill_id,
    count: typeof r.count === 'object' ? r.count.toNumber() : r.count,
    avg_rating: r.avg_rating,
  }));
}

// ═══════════════════════════════════════════════════
// Maintenance
// ═══════════════════════════════════════════════════

/**
 * Prune old low-rated patterns to keep graph focused.
 * Keep high-rated patterns forever — they're learned knowledge.
 */
export async function pruneOldPatterns(days: number = 90): Promise<number> {
  const results = await run(`
    MATCH (p:Pattern)
    WHERE p.created_at < datetime() - duration({days: $days})
      AND (p.rating IS NULL OR p.rating < 4)
    WITH p LIMIT 1000
    DETACH DELETE p
    RETURN count(*) as deleted
  `, { days });

  const deleted = results[0]?.deleted ?? 0;
  console.log(`[neo4j] pruned ${deleted} old patterns (>${days} days, rating <4)`);
  return typeof deleted === 'object' ? deleted.toNumber() : deleted;
}

/**
 * Get graph stats for monitoring.
 */
export async function getGraphStats(): Promise<Record<string, number>> {
  const results = await run(`
    MATCH (p:Pattern) WITH count(p) as patterns
    MATCH (v:Voice) WITH patterns, count(v) as voices
    MATCH (m:Move) WITH patterns, voices, count(m) as moves
    MATCH (s:Skill) WITH patterns, voices, moves, count(s) as skills
    RETURN patterns, voices, moves, skills
  `);

  const r = results[0] ?? {};
  return {
    patterns: typeof r.patterns === 'object' ? r.patterns.toNumber() : (r.patterns ?? 0),
    voices: typeof r.voices === 'object' ? r.voices.toNumber() : (r.voices ?? 0),
    moves: typeof r.moves === 'object' ? r.moves.toNumber() : (r.moves ?? 0),
    skills: typeof r.skills === 'object' ? r.skills.toNumber() : (r.skills ?? 0),
  };
}
