/**
 * Graph Context Builder — the bridge between Neo4j and the LLM.
 *
 * Before each LLM call (evolution tick or human command), this module
 * queries Neo4j for relevant musical knowledge and formats it as a
 * context string that gets injected into the system prompt.
 *
 * The LLM never knows Neo4j exists. It just receives better context:
 *   "When using sawtooth chords with Eb voicings, TR808 ghost snares
 *    at gain 0.12 have consistently produced high-rated patterns."
 *
 * This is the piece that makes the agent GET SMARTER over time.
 *
 * Usage in agent.ts:
 *   import { buildGraphContext } from './db/graph-context.js';
 *
 *   // In buildEvolutionPrompt():
 *   const memory = await buildGraphContext(skill.id, currentCode);
 *   return basePrompt + memory;
 */

import {
  isConnected,
  getBestMoves,
  getBestVoicePairings,
  getUnderExploredMoves,
  getDrumPairingsForNotes,
  getBestSkillForVibe,
  getTopPatterns,
  getBestEvolutionPaths,
  getCrossGenreDiscoveries,
} from './neo4j.js';
import { parseVoices, extractBpm, detectKeyAndScale } from './voice-parser.js';

// ═══════════════════════════════════════════════════
// Main context builder — called before every LLM call
// ═══════════════════════════════════════════════════

/**
 * Build a context string from Neo4j graph data.
 * Returns empty string if Neo4j is not connected (graceful degradation).
 *
 * @param skillId - current skill ("lofi-dj", "jazz-improv", etc.)
 * @param currentCode - the Strudel code currently playing
 * @param options - control what context to include
 */
export async function buildGraphContext(
  skillId: string,
  currentCode: string,
  options: ContextOptions = {},
): Promise<string> {
  if (!isConnected()) return '';

  const sections: string[] = [];

  try {
    // Run queries in parallel for speed
    const [
      bestMoves,
      voicePairings,
      unexplored,
      noteInsights,
    ] = await Promise.all([
      options.skipMoves ? null : getBestMovesContext(skillId),
      options.skipPairings ? null : getVoicePairingsContext(skillId),
      options.skipUnexplored ? null : getUnexploredContext(skillId),
      options.skipNotes ? null : getNoteInsightsContext(currentCode),
    ]);

    if (bestMoves) sections.push(bestMoves);
    if (voicePairings) sections.push(voicePairings);
    if (unexplored) sections.push(unexplored);
    if (noteInsights) sections.push(noteInsights);
  } catch (e: any) {
    console.error('[graph-context] query failed:', e.message);
    return ''; // graceful — LLM still works, just without graph memory
  }

  if (sections.length === 0) return '';

  return `\n\n## LEARNED FROM PAST SESSIONS (use this knowledge)\n${sections.join('\n')}`;
}

/**
 * Build context for the daily review prompt.
 * Includes broader analysis: evolution paths, cross-genre discoveries.
 */
export async function buildReviewContext(skillId: string): Promise<string> {
  if (!isConnected()) return '';

  const sections: string[] = [];

  try {
    const [topPatterns, worstPatterns, bestPaths, crossGenre] = await Promise.all([
      getTopPatternsContext(),
      getWorstPatternsContext(),
      getEvolutionPathsContext(),
      getCrossGenreContext(),
    ]);

    if (topPatterns) sections.push(topPatterns);
    if (worstPatterns) sections.push(worstPatterns);
    if (bestPaths) sections.push(bestPaths);
    if (crossGenre) sections.push(crossGenre);
  } catch (e: any) {
    console.error('[graph-context] review query failed:', e.message);
    return '';
  }

  if (sections.length === 0) return '';

  return `\n\n## GRAPH ANALYSIS\n${sections.join('\n')}`;
}

/**
 * Build context for vibe-to-skill selection.
 * Helps the agent pick the right skill for a vibe description.
 */
export async function buildVibeContext(vibeKeywords: string[]): Promise<string> {
  if (!isConnected() || vibeKeywords.length === 0) return '';

  try {
    const results: string[] = [];

    for (const keyword of vibeKeywords.slice(0, 3)) {
      const skills = await getBestSkillForVibe(keyword);
      if (skills.length > 0) {
        const best = skills[0];
        results.push(
          `"${keyword}" → ${best.skill_id} (avg rating ${best.avg_rating.toFixed(1)}, used ${best.count} times)`
        );
      }
    }

    if (results.length === 0) return '';
    return `\nVibe history: ${results.join('; ')}`;
  } catch {
    return '';
  }
}

// ═══════════════════════════════════════════════════
// Individual context sections
// ═══════════════════════════════════════════════════

async function getBestMovesContext(skillId: string): Promise<string | null> {
  const moves = await getBestMoves(7, 5);

  // Filter to moves relevant to this skill
  const relevant = moves.filter(m =>
    m.genres.includes(skillId) && m.success_count >= 2
  );

  if (relevant.length === 0) return null;

  const lines = relevant.map(m =>
    `- "${m.description}" (worked ${m.success_count} times, avg +${m.avg_improvement.toFixed(1)} rating)`
  );

  return `\nMoves that worked well for this genre recently:\n${lines.join('\n')}`;
}

async function getVoicePairingsContext(skillId: string): Promise<string | null> {
  const pairings = await getBestVoicePairings(skillId, 5);

  if (pairings.length === 0) return null;

  const lines = pairings.map(p =>
    `- ${p.voice1_name} + ${p.voice2_name} → avg rating ${p.avg_rating.toFixed(1)} (${p.count} patterns)`
  );

  return `\nVoice combinations that listeners liked:\n${lines.join('\n')}`;
}

async function getUnexploredContext(skillId: string): Promise<string | null> {
  const moves = await getUnderExploredMoves(skillId, 3);

  if (moves.length === 0) return null;

  const lines = moves.map(m =>
    `- "${m.description}" (only tried ${m.success_count} times but avg +${m.avg_improvement.toFixed(1)})`
  );

  return `\nUnder-explored moves worth trying:\n${lines.join('\n')}`;
}

/**
 * Check if the current pattern's notes have known good drum pairings.
 * This is the "note('D3 F#2') + which drums?" query.
 */
async function getNoteInsightsContext(currentCode: string): Promise<string | null> {
  // Extract chord/melody notes from current code
  const voices = parseVoices('temp', currentCode);
  const melodicVoices = voices.filter(v =>
    v.type === 'harmony' || v.type === 'melody'
  );

  if (melodicVoices.length === 0) return null;

  // Collect all notes from melodic voices
  const allNotes = melodicVoices.flatMap(v => v.notes);
  if (allNotes.length === 0) return null;

  // Query: what drums work with these notes?
  const pairings = await getDrumPairingsForNotes(allNotes, 3);

  if (pairings.length === 0) return null;

  const noteStr = allNotes.join(', ');
  const lines = pairings.map(p =>
    `- ${p.drum_name}: ${truncateCode(p.drum_code)} (avg rating ${p.avg_rating.toFixed(1)}, ${p.count} times)`
  );

  return `\nDrum patterns that worked well with notes [${noteStr}]:\n${lines.join('\n')}`;
}

async function getTopPatternsContext(): Promise<string | null> {
  const patterns = await getTopPatterns(24, 5);
  if (patterns.length === 0) return null;

  const lines = patterns.map(p =>
    `- [${p.skill_id}] rating ${p.rating}, ${p.voice_count} voices (${p.voices.join(', ')})`
  );

  return `\nTop patterns (last 24h):\n${lines.join('\n')}`;
}

async function getWorstPatternsContext(): Promise<string | null> {
  const patterns = await getTopPatterns(24, 5);
  if (patterns.length === 0) return null;

  // Intentionally brief — we don't want to pollute the prompt with bad code
  return `\n${patterns.length} low-rated patterns found in last 24h. Common issues should be addressed in updated rules.`;
}

async function getEvolutionPathsContext(): Promise<string | null> {
  const paths = await getBestEvolutionPaths(3);
  if (paths.length === 0) return null;

  const lines = paths.map(p =>
    `- Rating ${p.start_rating} → ${p.end_rating} in ${p.steps} steps (+${p.improvement})`
  );

  return `\nBest evolution paths (low → high rated):\n${lines.join('\n')}`;
}

async function getCrossGenreContext(): Promise<string | null> {
  const discoveries = await getCrossGenreDiscoveries(3);
  if (discoveries.length === 0) return null;

  const lines = discoveries.map(d =>
    `- ${d.voice_name} voice worked in both ${d.genre1} and ${d.genre2}`
  );

  return `\nCross-genre discoveries:\n${lines.join('\n')}`;
}

// ═══════════════════════════════════════════════════
// Utils
// ═══════════════════════════════════════════════════

function truncateCode(code: string): string {
  if (code.length <= 60) return code;
  return code.slice(0, 57) + '...';
}

// ═══════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════

export interface ContextOptions {
  skipMoves?: boolean;
  skipPairings?: boolean;
  skipUnexplored?: boolean;
  skipNotes?: boolean;
}
