/**
 * Curator Controls — WebSocket API for the reward/rollback system.
 *
 * You (the curator) can:
 *   1. Pin a golden pattern:     "This is perfect. Learn from this."
 *   2. Mark a pattern to avoid:  "Never do this again."
 *   3. Set a direction:          "More reverb, less busy drums."
 *   4. Set a boundary:           "Never more than 4 voices."
 *   5. View skill scorecard:     See if the skill is improving or degrading.
 *   6. Rollback a skill:         Revert to a previous version.
 *   7. Adjust score weights:     "I care more about play duration than ratings."
 *
 * These integrate into the existing WebSocket protocol.
 *
 * New message types (Browser → Server):
 *   { type: 'curator_reward',  reward_type: 'golden', note: '...', weight: 8 }
 *   { type: 'curator_reward',  reward_type: 'avoid',  note: '...' }
 *   { type: 'curator_reward',  reward_type: 'direction', note: 'more swing' }
 *   { type: 'curator_reward',  reward_type: 'boundary', note: 'max 4 voices' }
 *   { type: 'skill_scorecard' }
 *   { type: 'skill_rollback',  to_version: 2 }
 *   { type: 'update_weights',  weights: { avg_rating: 0.4, ... } }
 *
 * New message types (Server → Browser):
 *   { type: 'scorecard', scorecard: SkillScorecard }
 *   { type: 'rollback_warning', message: '...', scorecard: SkillScorecard }
 *   { type: 'rollback_complete', from: 3, to: 2, message: '...' }
 */

import type { CuratorReward, RewardType, ScoreWeights } from './scorecard.js';

// ═══════════════════════════════════════════════════
// Extended WebSocket Message Types
// ═══════════════════════════════════════════════════

/** New incoming messages for curator controls */
export interface CuratorIncoming {
  type: 'curator_reward' | 'skill_scorecard' | 'skill_rollback' | 'update_weights';

  // For curator_reward
  reward_type?: RewardType;
  note?: string;
  weight?: number;             // 1-10, default 5

  // For skill_rollback
  to_version?: number;

  // For update_weights
  weights?: Partial<ScoreWeights>;
}

/** New outgoing messages for curator feedback */
export interface CuratorOutgoing {
  type: 'scorecard' | 'rollback_warning' | 'rollback_complete' | 'reward_saved';

  message?: string;
  scorecard?: {
    skill_id: string;
    version: number;
    composite_score: number;
    status: string;
    delta: number | null;
    confidence: number;
    metrics: {
      avg_rating: number;
      avg_play_secs: number;
      human_override_rate: number;
      skip_rate: number;
      rating_trend: number;
      high_rate: number;
      low_rate: number;
    };
    golden_count: number;
    avoid_count: number;
  };

  // For rollback
  from_version?: number;
  to_version?: number;
}

// ═══════════════════════════════════════════════════
// How Rewards Map to LLM Behavior
// ═══════════════════════════════════════════════════

/**
 * The four reward types and what they do to the LLM:
 *
 * GOLDEN (weight 1-10):
 *   - Pattern is stored as a reference
 *   - Injected into system prompt: "Generate music in this direction"
 *   - Higher weight = stronger influence on evolution moves
 *   - Multiple golden patterns = the agent tries to find the sweet spot
 *
 * AVOID:
 *   - Pattern is stored as anti-reference
 *   - Injected into system prompt: "Do NOT generate similar to this"
 *   - Agent penalized for generating patterns with similar structure
 *   - Affects scorecard: curator_alignment drops if output matches avoid patterns
 *
 * DIRECTION:
 *   - Free-text instruction: "more swing", "darker chords", "sparser drums"
 *   - Injected into system prompt as a guiding principle
 *   - Weight determines priority vs other directions
 *   - Can contradict learned graph knowledge (curator wins)
 *
 * BOUNDARY:
 *   - Hard constraint: "never more than 4 voices", "always keep kick"
 *   - Injected into system prompt as a rule
 *   - Agent should not cross this even if graph data suggests it
 *
 * Priority order: Boundary > Curator Direction > Golden/Avoid > Graph Knowledge
 */

// ═══════════════════════════════════════════════════
// Example Curator Workflow
// ═══════════════════════════════════════════════════

/**
 * Day 1: Start streaming. Agent evolves lo-fi patterns.
 *
 * Day 2: You notice the agent keeps making drums too busy.
 *   → curator_reward { type: 'boundary', note: 'max 3 drum voices' }
 *   → curator_reward { type: 'direction', note: 'drums should be minimal and spacious' }
 *
 * Day 3: Agent generates a pattern you love.
 *   → curator_reward { type: 'golden', weight: 9, note: 'perfect lo-fi groove' }
 *   Now the daily review knows: THIS is the target.
 *
 * Day 5: You check the scorecard.
 *   → skill_scorecard
 *   Response: { composite_score: 72, status: 'improving', delta: +8 }
 *   Great — the rewards are working.
 *
 * Day 8: Daily review extracted a bad lesson. Score drops.
 *   → Server auto-sends: rollback_warning { message: 'v3 score 58 vs v2 score 71' }
 *   → You decide: skill_rollback { to_version: 2 }
 *   → Agent reverts to v2 rules. v3 lessons are discarded.
 *
 * Day 10: You realize you want the agent to sometimes cross genres.
 *   → curator_reward { type: 'direction', note: 'try jazz voicings in lo-fi sometimes', weight: 3 }
 *   Low weight = gentle suggestion, not mandate.
 *
 * Day 15: Check scorecard again.
 *   → { composite_score: 78, status: 'improving', delta: +6, confidence: 0.85 }
 *   The agent is learning YOUR taste, not just crowd averages.
 */

// ═══════════════════════════════════════════════════
// Integration into agent.ts system prompt
// ═══════════════════════════════════════════════════

/**
 * The full prompt injection order:
 *
 * 1. Base knowledge (strudel.md, composition.md, patterns.md)
 * 2. Skill rules (rules.md — including "Learned" section from daily review)
 * 3. Graph context (buildGraphContext — what worked in past sessions)
 * 4. Curator rewards (buildRewardContext — golden, avoid, direction, boundary)
 * 5. Current code + musician move
 *
 * Curator rewards come AFTER graph context because they override it.
 * If the graph says "filter sweeps work" but you marked a filter-heavy
 * pattern as "avoid", the curator wins.
 *
 * In code:
 *
 *   const graphMemory = await buildGraphContext(skill.id, currentCode);
 *   const curatorContext = buildRewardContext(curatorRewards);
 *   const systemPrompt = buildSystemPrompt(skill) + graphMemory + curatorContext;
 */
