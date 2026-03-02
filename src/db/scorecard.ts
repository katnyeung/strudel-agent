/**
 * Skill Scorecard — Evaluation, Rollback & Reward System
 *
 * Solves three problems:
 *   1. How do I know a skill is getting BETTER, not worse?
 *   2. How do I rewind when it gets worse? (like Claude Code revert)
 *   3. How do I actively guide improvement? (reward system)
 *
 * Design:
 *   - Every skill version gets a running "scorecard" with multiple metrics
 *   - Each metric has a weight you can tune
 *   - When a new version's score drops below the previous, it gets flagged
 *   - You (the curator) can approve, revert, or override
 *   - The reward system lets you pin "golden patterns" that the agent
 *     should learn from and avoid deviating too far from
 *
 * Stored in Neon for persistence, computed from evolution data.
 */

// ═══════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════

/** Composite score for a skill version over a time window */
export interface SkillScorecard {
  skill_id: string;
  version: number;
  window_start: string;       // ISO datetime
  window_end: string;

  // ─── Raw metrics ─────────────────────
  total_evolutions: number;
  total_rated: number;
  avg_rating: number;         // 1-5 scale
  rating_trend: number;       // slope: positive = improving, negative = degrading
  avg_play_secs: number;      // how long patterns play before being changed
  human_override_rate: number; // % of evolutions where human edited immediately
  skip_rate: number;          // % of evolutions that played < 30 seconds
  high_rate: number;          // % of evolutions rated 4-5
  low_rate: number;           // % of evolutions rated 1-2

  // ─── Composite score ─────────────────
  composite_score: number;    // 0-100, weighted combination
  confidence: number;         // 0-1, based on sample size (low data = low confidence)

  // ─── Comparison ──────────────────────
  prev_version_score: number | null;  // previous version's composite
  delta: number | null;               // this - previous (positive = improvement)
  status: ScorecardStatus;
}

export type ScorecardStatus =
  | 'improving'       // score > prev by meaningful margin
  | 'stable'          // score within ±5% of prev
  | 'degrading'       // score < prev by meaningful margin
  | 'insufficient'    // not enough data to judge
  | 'new';            // first version, no comparison

/** Curator reward — you explicitly mark a pattern as good/bad */
export interface CuratorReward {
  id: string;
  pattern_id: string;
  code: string;
  skill_id: string;
  reward_type: RewardType;
  weight: number;            // 1-10, how strongly this should influence
  note: string;              // your reason: "perfect groove", "too busy"
  created_at: string;
}

export type RewardType =
  | 'golden'          // "This is exactly what I want. Learn from this."
  | 'avoid'           // "Never do this again."
  | 'direction'       // "More like this, but not exactly this."
  | 'boundary';       // "This is the limit — don't go further in this direction."

/** Rollback decision */
export interface RollbackDecision {
  skill_id: string;
  from_version: number;
  to_version: number;
  reason: string;
  decided_by: 'auto' | 'curator';
  scorecard_before: SkillScorecard;
  created_at: string;
}

// ═══════════════════════════════════════════════════
// Score Weights — tune these to match your taste
// ═══════════════════════════════════════════════════

export interface ScoreWeights {
  avg_rating: number;          // how much explicit ratings matter
  play_duration: number;       // how much "played a long time" matters
  low_override_rate: number;   // how much "human didn't intervene" matters
  low_skip_rate: number;       // how much "didn't skip quickly" matters
  rating_trend: number;        // how much "ratings improving over time" matters
  curator_alignment: number;   // how much alignment with golden patterns matters
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  avg_rating: 0.30,           // 30% — explicit ratings are strongest signal
  play_duration: 0.20,        // 20% — long play = people like it
  low_override_rate: 0.15,    // 15% — not being overridden is good
  low_skip_rate: 0.10,        // 10% — not being skipped quickly is good
  rating_trend: 0.10,         // 10% — improving over time matters
  curator_alignment: 0.15,    // 15% — matching what you explicitly like
};

// ═══════════════════════════════════════════════════
// Score Computation
// ═══════════════════════════════════════════════════

/**
 * Compute composite score from raw metrics.
 * Each metric is normalized to 0-100 then weighted.
 */
export function computeCompositeScore(
  metrics: {
    avg_rating: number;         // 1-5
    avg_play_secs: number;      // 0-∞
    human_override_rate: number; // 0-1
    skip_rate: number;          // 0-1
    rating_trend: number;       // -1 to +1
    curator_alignment: number;  // 0-1
  },
  weights: ScoreWeights = DEFAULT_WEIGHTS,
): number {
  // Normalize each metric to 0-100
  const normalized = {
    avg_rating: ((metrics.avg_rating - 1) / 4) * 100,            // 1→0, 5→100
    play_duration: Math.min(metrics.avg_play_secs / 300, 1) * 100, // 0→0, 300s(5min)→100
    low_override_rate: (1 - metrics.human_override_rate) * 100,    // 0% overrides→100
    low_skip_rate: (1 - metrics.skip_rate) * 100,                  // 0% skips→100
    rating_trend: ((metrics.rating_trend + 1) / 2) * 100,         // -1→0, +1→100
    curator_alignment: metrics.curator_alignment * 100,             // 0→0, 1→100
  };

  // Weighted sum
  return (
    normalized.avg_rating * weights.avg_rating +
    normalized.play_duration * weights.play_duration +
    normalized.low_override_rate * weights.low_override_rate +
    normalized.low_skip_rate * weights.low_skip_rate +
    normalized.rating_trend * weights.rating_trend +
    normalized.curator_alignment * weights.curator_alignment
  );
}

/**
 * Compute confidence based on sample size.
 * Need at least 50 evolutions for high confidence.
 */
export function computeConfidence(totalEvolutions: number, totalRated: number): number {
  const sizeConfidence = Math.min(totalEvolutions / 50, 1);
  const ratedConfidence = Math.min(totalRated / 10, 1);
  return sizeConfidence * 0.6 + ratedConfidence * 0.4;
}

/**
 * Determine scorecard status by comparing to previous version.
 */
export function determineStatus(
  currentScore: number,
  prevScore: number | null,
  confidence: number,
): ScorecardStatus {
  if (confidence < 0.3) return 'insufficient';
  if (prevScore === null) return 'new';

  const delta = currentScore - prevScore;
  const threshold = 5; // ±5 points = stable

  if (delta > threshold) return 'improving';
  if (delta < -threshold) return 'degrading';
  return 'stable';
}

// ═══════════════════════════════════════════════════
// Curator Alignment Score
// ═══════════════════════════════════════════════════

/**
 * How well does a pattern align with curator rewards?
 *
 * Compares pattern's voices/characteristics against golden patterns
 * and avoid patterns. Returns 0-1 (1 = perfectly aligned).
 */
export function computeCuratorAlignment(
  patternVoices: string[],       // ["kick", "bass", "chord"]
  patternSynths: string[],       // ["bd", "triangle", "sawtooth"]
  goldenPatterns: CuratorReward[],
  avoidPatterns: CuratorReward[],
): number {
  if (goldenPatterns.length === 0 && avoidPatterns.length === 0) {
    return 0.5; // neutral — no curator input yet
  }

  let score = 0.5; // start neutral

  // Boost for similarity to golden patterns
  for (const golden of goldenPatterns) {
    const goldenVoices = extractVoiceNames(golden.code);
    const overlap = patternVoices.filter(v => goldenVoices.includes(v)).length;
    const similarity = goldenVoices.length > 0
      ? overlap / Math.max(goldenVoices.length, patternVoices.length)
      : 0;
    score += similarity * 0.3 * (golden.weight / 10);
  }

  // Penalty for similarity to avoid patterns
  for (const avoid of avoidPatterns) {
    const avoidVoices = extractVoiceNames(avoid.code);
    const overlap = patternVoices.filter(v => avoidVoices.includes(v)).length;
    const similarity = avoidVoices.length > 0
      ? overlap / Math.max(avoidVoices.length, patternVoices.length)
      : 0;
    score -= similarity * 0.3 * (avoid.weight / 10);
  }

  return Math.max(0, Math.min(1, score));
}

function extractVoiceNames(code: string): string[] {
  const matches = code.matchAll(/^\$(\w+):/gm);
  return [...matches].map(m => m[1]);
}

// ═══════════════════════════════════════════════════
// Rating Trend (linear regression slope)
// ═══════════════════════════════════════════════════

/**
 * Simple linear regression on ratings over time.
 * Returns slope: positive = improving, negative = degrading.
 * Normalized to -1..+1 range.
 */
export function computeRatingTrend(
  ratings: Array<{ rating: number; timestamp: number }>,
): number {
  if (ratings.length < 3) return 0; // not enough data

  const n = ratings.length;
  const xs = ratings.map((_, i) => i);  // normalize to 0,1,2,...
  const ys = ratings.map(r => r.rating);

  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sumXX = xs.reduce((a, x) => a + x * x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

  // Normalize: a slope of +0.1 per evolution is very good,
  // -0.1 is very bad. Clamp to -1..+1.
  return Math.max(-1, Math.min(1, slope * 10));
}

// ═══════════════════════════════════════════════════
// Rollback Logic
// ═══════════════════════════════════════════════════

export interface RollbackPolicy {
  auto_rollback_enabled: boolean;
  degradation_threshold: number;  // how many points below prev to trigger
  min_confidence: number;         // minimum confidence to auto-rollback
  cooldown_hours: number;         // don't rollback again within this window
  require_curator_approval: boolean; // if true, flag but don't auto-rollback
}

export const DEFAULT_ROLLBACK_POLICY: RollbackPolicy = {
  auto_rollback_enabled: true,
  degradation_threshold: 10,     // 10 points below prev = rollback
  min_confidence: 0.5,           // need 50%+ confidence
  cooldown_hours: 48,            // don't rollback more than once per 2 days
  require_curator_approval: true, // default: flag for you, don't auto-revert
};

/**
 * Check if a skill version should be rolled back.
 */
export function shouldRollback(
  scorecard: SkillScorecard,
  policy: RollbackPolicy = DEFAULT_ROLLBACK_POLICY,
  lastRollbackTime: number | null = null,
): { shouldRollback: boolean; reason: string } {
  // Not enough data
  if (scorecard.confidence < policy.min_confidence) {
    return { shouldRollback: false, reason: 'Insufficient data to judge' };
  }

  // No previous version to compare against
  if (scorecard.prev_version_score === null) {
    return { shouldRollback: false, reason: 'First version — no comparison available' };
  }

  // Check cooldown
  if (lastRollbackTime) {
    const hoursSince = (Date.now() - lastRollbackTime) / (1000 * 60 * 60);
    if (hoursSince < policy.cooldown_hours) {
      return { shouldRollback: false, reason: `Within cooldown (${Math.round(hoursSince)}h / ${policy.cooldown_hours}h)` };
    }
  }

  // Check degradation
  const delta = scorecard.composite_score - scorecard.prev_version_score;
  if (delta < -policy.degradation_threshold) {
    return {
      shouldRollback: true,
      reason: `Score dropped ${Math.abs(delta).toFixed(1)} points (${scorecard.prev_version_score.toFixed(1)} → ${scorecard.composite_score.toFixed(1)}). Threshold: ${policy.degradation_threshold}.`,
    };
  }

  return { shouldRollback: false, reason: 'Score is stable or improving' };
}

// ═══════════════════════════════════════════════════
// Neon SQL — Tables for scorecard & rewards
// ═══════════════════════════════════════════════════

export const SCORECARD_SQL = `
-- Skill version scorecards — one row per version per evaluation window
CREATE TABLE IF NOT EXISTS skill_scorecards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id        VARCHAR(64) NOT NULL,
  version         INT NOT NULL,
  window_start    TIMESTAMPTZ NOT NULL,
  window_end      TIMESTAMPTZ NOT NULL,

  -- Raw metrics
  total_evolutions INT NOT NULL DEFAULT 0,
  total_rated      INT NOT NULL DEFAULT 0,
  avg_rating       NUMERIC(3,2),
  rating_trend     NUMERIC(4,3),        -- -1 to +1
  avg_play_secs    INT,
  human_override_rate NUMERIC(4,3),     -- 0 to 1
  skip_rate        NUMERIC(4,3),
  high_rate        NUMERIC(4,3),        -- % rated 4-5
  low_rate         NUMERIC(4,3),        -- % rated 1-2

  -- Composite
  composite_score  NUMERIC(5,2),        -- 0-100
  confidence       NUMERIC(3,2),        -- 0-1
  prev_version_score NUMERIC(5,2),
  delta            NUMERIC(5,2),
  status           VARCHAR(20) NOT NULL DEFAULT 'new',

  created_at       TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(skill_id, version, window_start)
);

-- Curator rewards — explicit pattern judgments
CREATE TABLE IF NOT EXISTS curator_rewards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id      TEXT,
  code            TEXT NOT NULL,
  skill_id        VARCHAR(64) NOT NULL,
  reward_type     VARCHAR(20) NOT NULL,  -- golden, avoid, direction, boundary
  weight          SMALLINT NOT NULL DEFAULT 5 CHECK (weight BETWEEN 1 AND 10),
  note            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Rollback history
CREATE TABLE IF NOT EXISTS skill_rollbacks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id        VARCHAR(64) NOT NULL,
  from_version    INT NOT NULL,
  to_version      INT NOT NULL,
  reason          TEXT NOT NULL,
  decided_by      VARCHAR(20) NOT NULL,  -- 'auto' or 'curator'
  composite_before NUMERIC(5,2),
  composite_after  NUMERIC(5,2),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scorecards_skill ON skill_scorecards(skill_id, version);
CREATE INDEX IF NOT EXISTS idx_rewards_skill ON curator_rewards(skill_id, reward_type);
CREATE INDEX IF NOT EXISTS idx_rollbacks_skill ON skill_rollbacks(skill_id, created_at DESC);
`;

// ═══════════════════════════════════════════════════
// Reward Prompt Injection — curator rewards → LLM context
// ═══════════════════════════════════════════════════

/**
 * Format curator rewards as LLM context.
 * Injected into system prompt alongside graph context.
 */
export function buildRewardContext(rewards: CuratorReward[]): string {
  if (rewards.length === 0) return '';

  const golden = rewards.filter(r => r.reward_type === 'golden');
  const avoid = rewards.filter(r => r.reward_type === 'avoid');
  const direction = rewards.filter(r => r.reward_type === 'direction');
  const boundary = rewards.filter(r => r.reward_type === 'boundary');

  const sections: string[] = [];

  if (golden.length > 0) {
    const lines = golden.map(r =>
      `- ${truncateCode(r.code, 80)}${r.note ? ` (curator: "${r.note}")` : ''} [weight: ${r.weight}/10]`
    );
    sections.push(`\nGOLDEN PATTERNS — the curator loves these. Generate music in this direction:\n${lines.join('\n')}`);
  }

  if (avoid.length > 0) {
    const lines = avoid.map(r =>
      `- ${truncateCode(r.code, 80)}${r.note ? ` (curator: "${r.note}")` : ''}`
    );
    sections.push(`\nAVOID PATTERNS — the curator explicitly dislikes these. Do NOT generate similar:\n${lines.join('\n')}`);
  }

  if (direction.length > 0) {
    const lines = direction.map(r =>
      `- "${r.note}" [weight: ${r.weight}/10]`
    );
    sections.push(`\nCURATOR DIRECTION — guiding principles:\n${lines.join('\n')}`);
  }

  if (boundary.length > 0) {
    const lines = boundary.map(r =>
      `- "${r.note}"`
    );
    sections.push(`\nBOUNDARIES — do not exceed:\n${lines.join('\n')}`);
  }

  return `\n\n## CURATOR REWARDS (these override learned patterns)\n${sections.join('\n')}`;
}

function truncateCode(code: string, max: number): string {
  // Get first $voice: line for brevity
  const firstVoice = code.match(/^\$\w+:.+$/m);
  const display = firstVoice ? firstVoice[0] : code;
  return display.length > max ? display.slice(0, max - 3) + '...' : display;
}
