/**
 * Graph Context Builder — the bridge between Neo4j and the LLM.
 *
 * Before each LLM call (evolution tick or human command), this module
 * queries Neo4j for relevant musical knowledge and formats it as a
 * context string that gets injected into the system prompt.
 *
 * The LLM never knows Neo4j exists. It just receives better context:
 *   "From [kick, bass, hat]: adding a $stab voice had 73% success rate,
 *    avg rating improved +0.4"
 *
 * This is the piece that makes the agent GET SMARTER over time.
 */

import {
  isConnected,
  getBestTransitions,
  getSuggestedVoicesToAdd,
  getSuggestedVoicesToRemove,
  getVoiceStateStats,
  getPopularVoiceStates,
  getLatestMoveInsight,
  getLatestEvolutionRecipe,
} from './neo4j.js';
import { extractVoiceNames } from './voice-parser.js';

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

  const currentVoices = extractVoiceNames(currentCode);
  const sections: string[] = [];

  try {
    const [
      transitionCtx,
      suggestCtx,
      stateCtx,
      explorationCtx,
      reviewCtx,
    ] = await Promise.all([
      options.skipTransitions ? null : getTransitionContext(skillId, currentVoices),
      options.skipSuggestions ? null : getVoiceSuggestionsContext(skillId, currentVoices),
      options.skipStateStats ? null : getStateStatsContext(skillId, currentVoices),
      options.skipExploration ? null : getExplorationContext(skillId),
      options.skipReview ? null : getReviewInsightsContext(skillId),
    ]);

    if (transitionCtx) sections.push(transitionCtx);
    if (suggestCtx) sections.push(suggestCtx);
    if (stateCtx) sections.push(stateCtx);
    if (explorationCtx) sections.push(explorationCtx);
    if (reviewCtx) sections.push(reviewCtx);
  } catch (e: any) {
    console.error('[graph-context] query failed:', e.message);
    return '';
  }

  if (sections.length === 0) return '';

  return `\n\n## LEARNED FROM PAST SESSIONS (use this knowledge)\n${sections.join('\n')}`;
}

/**
 * Build context for the review prompt.
 * Includes transition heatmap and popular voice states.
 */
export async function buildReviewContext(skillId: string): Promise<string> {
  if (!isConnected()) return '';

  const sections: string[] = [];

  try {
    const popular = await getPopularVoiceStates(skillId, 2, 10);

    if (popular.length > 0) {
      const lines = popular.map(p =>
        `- [${p.voices.join(',')}]: ${p.total_visits} visits, avg rating ${p.avg_rating?.toFixed(1) ?? 'N/A'}`
      );
      sections.push(`\nPopular voice states:\n${lines.join('\n')}`);
    }
  } catch (e: any) {
    console.error('[graph-context] review query failed:', e.message);
    return '';
  }

  if (sections.length === 0) return '';

  return `\n\n## GRAPH ANALYSIS\n${sections.join('\n')}`;
}

// ═══════════════════════════════════════════════════
// Individual context sections
// ═══════════════════════════════════════════════════

async function getTransitionContext(skillId: string, currentVoices: string[]): Promise<string | null> {
  if (currentVoices.length === 0) return null;

  const transitions = await getBestTransitions(skillId, currentVoices, 1, 5);
  if (transitions.length === 0) return null;

  const lines = transitions.map(t => {
    const added = t.to_voices.filter(v => !currentVoices.includes(v));
    const removed = currentVoices.filter(v => !t.to_voices.includes(v));
    const changes = [
      ...added.map(v => `+${v}`),
      ...removed.map(v => `-${v}`),
    ].join(', ');
    const ratingStr = t.avg_rating_after != null ? `, avg rating ${t.avg_rating_after.toFixed(1)}` : '';
    return `- ${changes} (${t.move_type}): ${t.count} times, ${(t.success_rate * 100).toFixed(0)}% success${ratingStr}`;
  });

  return `\nPast transitions from current state (voice set changes that worked):\n${lines.join('\n')}`;
}

async function getVoiceSuggestionsContext(skillId: string, currentVoices: string[]): Promise<string | null> {
  if (currentVoices.length === 0) return null;

  const [toAdd, toRemove] = await Promise.all([
    getSuggestedVoicesToAdd(skillId, currentVoices, 2, 5),
    getSuggestedVoicesToRemove(skillId, currentVoices, 2, 3),
  ]);

  if (toAdd.length === 0 && toRemove.length === 0) return null;

  const lines: string[] = [];
  if (toAdd.length > 0) {
    lines.push('Voices worth adding (from high-rated states that include your current voices):');
    for (const s of toAdd) {
      lines.push(`- Add $${s.voice_name}: — seen in ${s.appearances} states, avg rating ${s.avg_rating?.toFixed(1) ?? 'N/A'}, best ${s.best_rating ?? 'N/A'}`);
    }
  }
  if (toRemove.length > 0) {
    lines.push('Voices worth removing (simpler states that rated well):');
    for (const s of toRemove) {
      lines.push(`- Remove $${s.voice_name}: — ${s.appearances} simpler states rated avg ${s.avg_rating?.toFixed(1) ?? 'N/A'}`);
    }
  }

  return `\n${lines.join('\n')}`;
}

async function getStateStatsContext(skillId: string, currentVoices: string[]): Promise<string | null> {
  if (currentVoices.length === 0) return null;

  const stats = await getVoiceStateStats(skillId, currentVoices);
  if (!stats) return null;

  const ratingStr = stats.avg_rating != null ? `, avg rating ${stats.avg_rating.toFixed(1)}` : '';
  return `\nCurrent state [${currentVoices.join(', ')}]: visited ${stats.total_visits} times${ratingStr}, best rating ${stats.best_rating ?? 'N/A'}`;
}

async function getExplorationContext(skillId: string): Promise<string | null> {
  const popular = await getPopularVoiceStates(skillId, 3, 5);
  if (popular.length === 0) return null;

  const lines = popular.map(p =>
    `- [${p.voices.join(', ')}]: ${p.total_visits} visits, avg rating ${p.avg_rating?.toFixed(1) ?? 'N/A'}`
  );

  return `\nMost successful voice combos in this genre:\n${lines.join('\n')}`;
}

async function getReviewInsightsContext(skillId: string): Promise<string | null> {
  const [moveInsight, recipe] = await Promise.all([
    getLatestMoveInsight(skillId),
    getLatestEvolutionRecipe(skillId),
  ]);

  if (!moveInsight && !recipe) return null;

  const lines: string[] = [];

  if (moveInsight?.top_insight) {
    lines.push(`- Move insight: ${moveInsight.top_insight}`);
  }

  if (recipe?.best_recipe_summary) {
    lines.push(`- Best recipe: ${recipe.best_recipe_summary}`);
  }

  if (moveInsight?.move_groups) {
    try {
      const groups = JSON.parse(moveInsight.move_groups) as Array<{
        group_name: string; works_when: string; avg_improvement: number;
      }>;
      for (const g of groups.slice(0, 3)) {
        lines.push(`- ${g.group_name}: ${g.works_when} (avg +${g.avg_improvement.toFixed(1)})`);
      }
    } catch { /* skip if parse fails */ }
  }

  if (lines.length === 0) return null;

  return `\nLLM-reviewed insights (from past analysis):\n${lines.join('\n')}`;
}

// ═══════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════

export interface ContextOptions {
  skipTransitions?: boolean;
  skipSuggestions?: boolean;
  skipStateStats?: boolean;
  skipExploration?: boolean;
  skipReview?: boolean;
}
