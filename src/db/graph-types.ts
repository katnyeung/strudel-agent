// ═══════════════════════════════════════════════════
// Neo4j Graph Types — State-Centric Musical Memory
// ═══════════════════════════════════════════════════

// ─── Node types ───────────────────────────────────

export interface VoiceStateNode {
  id: string;                // "vs_{skill_id}_{sorted-voice-names}" e.g. vs_minimal-techno_bass-hat-kick
  skill_id: string;
  voices: string[];          // ["bass", "hat", "kick"] — sorted
  voice_count: number;
  voice_types: VoiceType[];  // sorted unique types present
  has_melody: boolean;
  has_bass: boolean;
  has_chords: boolean;
  total_visits: number;
  avg_rating: number | null;
  best_rating: number | null;
  avg_play_secs: number;
  first_seen: string;        // ISO datetime
  last_seen: string;         // ISO datetime
}

export type VoiceType = 'drums' | 'bass' | 'harmony' | 'melody' | 'texture';

export interface SkillNode {
  id: string;
  name: string;
  version: number;
  icon: string;
}

// ─── LLM Review node types ───────────────────────

export interface MoveInsightNode {
  id: string;              // "mi_{skill_id}_{date}"
  skill_id: string;
  review_date: string;
  move_groups: string;     // JSON: [{ group_name, move_types[], works_when, avg_improvement }]
  top_insight: string;     // one-liner for the agent
  raw_response: string;
}

export interface EvolutionRecipeNode {
  id: string;              // "er_{skill_id}_{date}"
  skill_id: string;
  review_date: string;
  recipes: string;         // JSON: [{ name, steps[], expected_rating, critical_step, description }]
  best_recipe_summary: string;
  raw_response: string;
}

// ─── Relationship types ─────────────────────────────

/** Edge between VoiceStates where the voice set actually changed. */
export interface TransitionRel {
  from_id: string;
  to_id: string;
  move_type: string;
  count: number;
  avg_rating_before: number | null;
  avg_rating_after: number | null;
  avg_improvement: number | null;
  success_rate: number;         // fraction of transitions that improved rating
  last_seen: string;
}

// ─── Query result types ───────────────────────────

export interface TransitionCandidate {
  to_voices: string[];
  move_type: string;
  count: number;
  avg_improvement: number | null;
  success_rate: number;
  avg_rating_after: number | null;
}

export interface VoiceSuggestion {
  voice_name: string;        // "bass", "hat", etc.
  appearances: number;       // how many states include this voice
  avg_rating: number | null; // avg rating of those states
  best_rating: number | null;
}

export interface VoiceStateStats {
  id: string;
  voices: string[];
  total_visits: number;
  avg_rating: number | null;
  best_rating: number | null;
  avg_play_secs: number;
}

export interface PopularVoiceState {
  id: string;
  voices: string[];
  voice_count: number;
  total_visits: number;
  avg_rating: number | null;
  best_rating: number | null;
}

