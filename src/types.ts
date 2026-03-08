// ═══════════════════════════════════════════════════
// Skill types — loaded from filesystem
// ═══════════════════════════════════════════════════

export interface Skill {
  id: string;
  name: string;
  icon: string;
  version: number;
  description: string;
  rules: string;             // rules.md content → becomes system prompt
  buildSequence: BuildStep[];
  changelog: string;
  tempo: { min: number; max: number; default: number };
  tags: string[];
  author: string;
  path: string;              // filesystem path for debugging
}

export interface BuildStep {
  stage: string;             // "foundation", "groove", "texture", etc.
  description: string;       // what this step does
  code?: string;             // example Strudel code (optional for "refine"/"variation")
}

// ═══════════════════════════════════════════════════
// WebSocket message types
// ═══════════════════════════════════════════════════

// ═══════════════════════════════════════════════════
// Tetris constraint types
// ═══════════════════════════════════════════════════

export interface TetrisConstraints {
  voices: Record<string, number>;  // voiceName → cell count
  totalCells: number;
  activeVoices: string[];          // voices with count > 0
}

/** Browser → Server */
export interface WsIncoming {
  type: 'select_skill' | 'command' | 'code_edit' | 'rate' | 'stop' | 'set_evolve_interval' | 'evolve_now'
      | 'tetris_state' | 'tetris_restart' | 'tetris_combo' | 'toggle_evolve' | 'tetris_random_speed';
  comboCount?: number;
  enabled?: boolean;
  skillId?: string;
  command?: string;
  currentCode?: string;
  rating?: number;           // 1-5
  voiceName?: string;        // optional: rate a specific voice (e.g. "hat")
  interval?: number;         // evolution interval in ms (10000-120000)
  constraints?: TetrisConstraints;  // tetris_state payload
}

/** Server → Browser */
export interface WsOutgoing {
  type: 'skills_list' | 'code_update' | 'thinking' | 'agent_log' | 'error'
      | 'tetris_next_piece' | 'tetris_spawn_piece' | 'tetris_remove_voice' | 'tetris_set_speed' | 'vocal_ready';
  speedMs?: number;
  sampleUrl?: string;
  sampleName?: string;       // "vocal0", "vocal1", etc.
  word?: string;
  code?: string;
  message?: string;
  phase?: 'bootstrap' | 'evolving' | 'responding';
  candidateNum?: number;
  candidateTotal?: number;
  skills?: SkillInfo[];
  pieceKey?: string;         // tetris_next_piece / tetris_spawn_piece
  voiceName?: string;        // tetris_remove_voice (reuses field name)
}

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
}

// ═══════════════════════════════════════════════════
// Agent session state
// ═══════════════════════════════════════════════════

export interface VocalState {
  word: string;
  sampleUrl: string;       // "/samples/vocal-{ts}.mp3"
  sampleName: string;      // "vocal0", "vocal1", etc. — unique per stack slot
  comboSize: number;        // how many lines triggered this
  ticksAlive: number;       // evolution ticks since injected
  maxTicks: number;         // 3 (normal) or 5 (big combo 10+)
  injected: boolean;        // has $vocal: been added to code?
}

export type AgentPhase = 'idle' | 'bootstrapping' | 'evolving';

export interface Session {
  id: string;
  send: (msg: WsOutgoing) => void;
  skill: Skill | null;
  currentCode: string;
  phase: AgentPhase;
  evolveCount: number;
  humanEdited: boolean;
  lastRating: number | null;
  lastHumanTime: number | null;    // Date.now() timestamp
  lastEvolveTime: number | null;
  evolveTimer: ReturnType<typeof setTimeout> | null;
  evolveInterval: number;    // ms between evolutions (default 60000)
  evolveEnabled: boolean;    // whether evolution loop is active
  voiceRatings: Map<string, number>;  // per-voice ratings (voice name → 1-5)
  humanQueue: HumanInput[];
  history: ChatMessage[];    // conversation history for LLM context
  // Tetris state
  tetrisActive: boolean;
  tetrisConstraints: TetrisConstraints | null;
  pendingConstraints: TetrisConstraints | null;
  llmInFlight: boolean;
  vocalStack: VocalState[];
  tetrisRandomSpeed: boolean;
}

export interface HumanInput {
  command: string;
  currentCode?: string;
}

// ═══════════════════════════════════════════════════
// LLM types
// ═══════════════════════════════════════════════════

export interface LlmConfig {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ═══════════════════════════════════════════════════
// Neon event logging types
// ═══════════════════════════════════════════════════

export interface ParsedVoice {
  name: string;
  code: string;
  type?: 'drum' | 'synth' | 'melodic' | 'bass' | 'fx' | 'unknown';
}

export interface EvolutionEvent {
  session_id: string;
  phase: string;
  move_type?: string;
  code_before?: string;
  code_after: string;
  voices?: ParsedVoice[];
  voice_count?: number;
  reason?: string;
}

export interface CommandEvent {
  session_id: string;
  command: string;
  code_before?: string;
  code_after?: string;
}

export interface RatingEvent {
  session_id: string;
  rating: number;
  code_snapshot?: string;
  voice_name?: string;
  voice_type?: string;
}

export interface SessionRecord {
  id: string;
  skill_id?: string;
  skill_name?: string;
}

export interface SessionEndStats {
  total_evolves: number;
  avg_rating?: number;
  final_code?: string;
}
