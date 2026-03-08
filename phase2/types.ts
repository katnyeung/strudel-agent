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

/** Browser → Server */
export interface WsIncoming {
  type: 'select_skill' | 'command' | 'code_edit' | 'rate' | 'stop' | 'vibe';
  skillId?: string;
  command?: string;
  currentCode?: string;
  rating?: number;           // 1-5
  vibeText?: string;         // natural language vibe description
}

/** Server → Browser */
export interface WsOutgoing {
  type: 'skills_list' | 'code_update' | 'thinking' | 'agent_log' | 'error';
  code?: string;
  message?: string;
  phase?: 'bootstrap' | 'evolving' | 'responding';
  candidateNum?: number;
  candidateTotal?: number;
  skills?: SkillInfo[];
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

export type AgentPhase = 'idle' | 'bootstrapping' | 'evolving';

/** Vibe context — stored when user describes a feeling instead of picking a skill */
export interface VibeContext {
  originalVibe: string;
  mood: string;
  energy: string;
  keywords: string[];
}

export interface Session {
  id: string;
  send: (msg: WsOutgoing) => void;
  skill: Skill | null;
  vibeContext: VibeContext | null;   // set when user uses vibe input
  currentCode: string;
  phase: AgentPhase;
  evolveCount: number;
  humanEdited: boolean;
  lastRating: number | null;
  lastHumanTime: number | null;
  lastEvolveTime: number | null;
  evolveTimer: ReturnType<typeof setTimeout> | null;
  humanQueue: HumanInput[];
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
