// ═══════════════════════════════════════════════════
// Neo4j Graph Types — Musical Memory
// ═══════════════════════════════════════════════════

// ─── Node types ───────────────────────────────────

export interface PatternNode {
  id: string;
  code: string;
  skill_id: string;
  voice_count: number;
  voices: string[];          // ["kick", "bass", "chord"]
  has_melody: boolean;
  has_chords: boolean;
  has_bass: boolean;
  bpm: number;
  key: string | null;        // "C", "Eb", etc.
  scale: string | null;      // "minor", "dorian"
  rating: number | null;     // 1-5 explicit or inferred
  play_secs: number;         // how long before next change
  created_at: string;        // ISO datetime
}

export interface VoiceNode {
  id: string;                // pattern_id + "_" + name
  name: string;              // "kick", "bass", "chord"
  code: string;              // just this voice line
  type: VoiceType;
  synth: string;             // "sawtooth", "triangle", "bd"
  notes: string[];           // ["D3", "F#2"]
  has_lpf: boolean;
  has_room: boolean;
  has_delay: boolean;
  has_swing: boolean;
  gain: number;
}

export type VoiceType = 'drums' | 'bass' | 'harmony' | 'melody' | 'texture';

export interface SkillNode {
  id: string;
  name: string;
  version: number;
  icon: string;
}

export interface MoveNode {
  type: string;              // "add_voice", "modify_filter", etc.
  description: string;
  category: 'bold' | 'subtle';
}

export interface VibeNode {
  text: string;              // "rainy café in tokyo"
  mood: string;              // "melancholy", "chill"
  energy: string;            // "low", "medium", "high"
  keywords: string[];
}

export interface SessionNode {
  id: string;
  started_at: string;
  ended_at: string | null;
  duration_m: number;
  evolutions: number;
  avg_rating: number | null;
}

export interface DailyReviewNode {
  id: string;
  review_date: string;
  skill_id: string;
  patterns_reviewed: number;
  lessons: string[];
  skill_version_before: number;
  skill_version_after: number;
}

// ─── Relationship properties ──────────────────────

export interface EvolvedToRel {
  reason: string;
  move_type: string;
  rating_delta: number | null;
  session_id: string;
}

export interface AppliedInRel {
  rating_before: number | null;
  rating_after: number | null;
  rating_delta: number | null;
  pattern_id: string;
}

export interface PairedWithRel {
  pattern_count: number;
  avg_rating: number;
  skill_id: string;
}

export interface TriggeredRel {
  session_id: string;
  pattern_id: string;
  rating: number | null;
}

// ─── Query result types ───────────────────────────

export interface EvolutionPath {
  start_code: string;
  start_rating: number;
  end_code: string;
  end_rating: number;
  steps: number;
  improvement: number;
}

export interface MoveEffectiveness {
  move_type: string;
  description: string;
  success_count: number;
  avg_improvement: number;
  genres: string[];
}

export interface VoicePairing {
  voice1_name: string;
  voice1_code: string;
  voice2_name: string;
  voice2_code: string;
  avg_rating: number;
  count: number;
}

export interface TopPattern {
  code: string;
  skill_id: string;
  rating: number;
  voices: string[];
  voice_count: number;
}

export interface CrossGenreDiscovery {
  voice_name: string;
  voice_code: string;
  genre1: string;
  genre2: string;
}
