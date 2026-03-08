import type { LlmGateway } from './llm.js';
import type { Skill, Session, HumanInput, WsOutgoing } from './types.js';
import { allSkills, getSkill, getBaseKnowledge } from './skills.js';
import {
  vibeMatch, researchForEvolution, enrichEvolutionMove, vibeCommandContext,
  type VibeContext,
} from './vibe.js';

/**
 * Copilot Agent — the brain of the system.
 *
 * Lifecycle:
 *   1. User picks a skill OR describes a vibe → bootstrap()
 *   2. Starts evolution loop — every 60s, optionally researches the web
 *      for new patterns, then adds/modifies one $: voice
 *   3. Human can interrupt anytime → agent responds, then resumes evolving
 *
 * The vibe engine enriches evolution with web-researched musical knowledge.
 * Skills stay fixed — the agent gets smarter by searching, not by creating skills.
 */

const EVOLVE_INTERVAL = 60_000;  // 60 seconds
const HUMAN_GRACE = 20_000;      // wait 20s after human edit

const sessions = new Map<string, Session>();

// ═══════════════════════════════════════════════════
// Session lifecycle
// ═══════════════════════════════════════════════════

export function startSession(id: string, send: (msg: WsOutgoing) => void): void {
  const session: Session = {
    id, send,
    skill: null,
    vibeContext: null,
    currentCode: '',
    phase: 'idle',
    evolveCount: 0,
    humanEdited: false,
    lastRating: null,
    lastHumanTime: null,
    lastEvolveTime: null,
    evolveTimer: null,
    humanQueue: [],
  };
  sessions.set(id, session);

  send({
    type: 'skills_list',
    skills: allSkills().map(s => ({
      id: s.id, name: s.name,
      description: s.description, icon: s.icon,
    })),
    message: 'Describe a vibe — like "rainy café at midnight" — or pick a skill to start.',
  });
}

export function stopSession(id: string): void {
  const s = sessions.get(id);
  if (s?.evolveTimer) clearTimeout(s.evolveTimer);
  sessions.delete(id);
}

// ═══════════════════════════════════════════════════
// Human interactions
// ═══════════════════════════════════════════════════

export function onSelectSkill(id: string, skillId: string, llm: LlmGateway): void {
  const s = sessions.get(id);
  if (!s) return;

  const skill = getSkill(skillId);
  if (!skill) {
    s.send({ type: 'error', message: `Unknown skill: ${skillId}` });
    return;
  }

  s.skill = skill;
  s.vibeContext = null; // direct skill pick, no vibe
  s.send({
    type: 'agent_log', phase: 'bootstrap',
    message: `${skill.icon} ${skill.name} — starting up...`,
  });

  bootstrap(s, llm);
}

/**
 * Handle a vibe description — matches to existing skill, starts with vibe context.
 */
export async function onVibe(id: string, vibeText: string, llm: LlmGateway): Promise<void> {
  const s = sessions.get(id);
  if (!s) return;

  // Stop any current evolution
  if (s.evolveTimer) clearTimeout(s.evolveTimer);

  try {
    const vibeCtx = await vibeMatch(vibeText, llm, (msg) => {
      s.send({ type: 'thinking', phase: 'bootstrap', message: msg });
    });

    s.skill = vibeCtx.matchedSkill;
    s.vibeContext = vibeCtx;

    s.send({
      type: 'agent_log', phase: 'bootstrap',
      message: `${vibeCtx.matchedSkill.icon} ${vibeCtx.matchReason}`,
    });

    bootstrap(s, llm);
  } catch (e: any) {
    console.error('[agent] vibe match failed:', e.message);
    s.send({ type: 'error', message: `Couldn't match your vibe: ${e.message}` });
  }
}

export function onCommand(id: string, command: string, currentCode: string | undefined, llm: LlmGateway): void {
  const s = sessions.get(id);
  if (!s) return;

  // If no skill active and input looks like a vibe, treat it as one
  if (!s.skill && isVibeDescription(command)) {
    onVibe(id, command, llm);
    return;
  }

  if (!s.skill) {
    s.skill = getSkill('lofi-dj') ?? allSkills()[0] ?? null;
    s.send({ type: 'agent_log', message: 'Defaulting to Lo-fi DJ...' });
    if (s.skill) bootstrap(s, llm);
  }

  s.humanQueue.push({ command, currentCode });

  if (s.phase === 'evolving') {
    respondToHuman(s, llm);
  }
}

export function onCodeEdit(id: string, code: string): void {
  const s = sessions.get(id);
  if (s) {
    s.currentCode = code;
    s.humanEdited = true;
    s.lastHumanTime = Date.now();
  }
}

export function onRate(id: string, rating: number): void {
  const s = sessions.get(id);
  if (!s) return;
  s.lastRating = rating;
  s.send({
    type: 'agent_log',
    message: rating >= 4 ? 'Glad you like it! Continuing this direction.'
           : rating <= 2 ? "Got it, I'll change things up next."
           : 'Noted — refining from here.',
  });
}

// ═══════════════════════════════════════════════════
// Vibe detection
// ═══════════════════════════════════════════════════

function isVibeDescription(text: string): boolean {
  const lower = text.toLowerCase();
  const commandPatterns = [
    /^(add|remove|delete|drop|change|make it|increase|decrease|more|less|louder|quieter|faster|slower|stop|mute)/,
    /^(play|pause|restart|reset)/,
    /swing|bpm|tempo|filter|reverb|delay|gain|lpf|hpf/,
  ];
  if (commandPatterns.some(p => p.test(lower))) return false;

  const vibePatterns = [
    /like|feels? like|sounds? like|imagine|picture|vibe|mood|atmosphere/,
    /rainy|sunny|night|morning|driving|walking|floating|dreaming/,
    /café|coffee|beach|ocean|forest|city|space|stars|rain/,
    /happy|sad|melancholy|peaceful|anxious|energetic|chill|dark|bright|warm|cool/,
    /i want|i('d)? like|give me|something (that|like)/,
  ];
  if (vibePatterns.some(p => p.test(lower))) return true;

  const words = text.split(/\s+/).length;
  if (words >= 5 && !lower.includes('$') && !lower.includes(':')) return true;

  return false;
}

// ═══════════════════════════════════════════════════
// Phase 1: BOOTSTRAP
// ═══════════════════════════════════════════════════

async function bootstrap(s: Session, llm: LlmGateway): Promise<void> {
  s.phase = 'bootstrapping';
  s.evolveCount = 0;
  const skill = s.skill!;

  const cps = (skill.tempo.default / 60 / 4).toFixed(3);
  const foundation = skill.buildSequence.find(step => step.code);
  const firstVoice = foundation ? foundation.code.trim() : '$kick: s("bd").gain(0.6)';
  const startCode = `setcps(${cps})\n${firstVoice}`;

  s.currentCode = startCode;
  s.send({
    type: 'code_update', code: startCode, phase: 'bootstrap',
    message: `${skill.icon} Starting simple — I'll evolve it and research new patterns as we go.`,
  });

  if (s.vibeContext) {
    s.send({
      type: 'agent_log', phase: 'evolving',
      message: `🎭 Vibe locked: "${s.vibeContext.originalVibe}" — I'll search for rhythms and patterns that match this feeling.`,
    });
  } else {
    s.send({
      type: 'agent_log', phase: 'evolving',
      message: "I'll evolve this every ~60s and research new patterns. Steer me anytime.",
    });
  }

  if (s.humanQueue.length > 0) await respondToHuman(s, llm);
  startEvolutionLoop(s, llm);
}

// ═══════════════════════════════════════════════════
// Phase 2: EVOLUTION with research
// ═══════════════════════════════════════════════════

function startEvolutionLoop(s: Session, llm: LlmGateway): void {
  s.phase = 'evolving';
  s.lastEvolveTime = Date.now();
  scheduleEvolution(s, llm);
}

function scheduleEvolution(s: Session, llm: LlmGateway): void {
  if (s.evolveTimer) clearTimeout(s.evolveTimer);
  s.evolveTimer = setTimeout(() => evolutionTick(s, llm), EVOLVE_INTERVAL);
}

async function evolutionTick(s: Session, llm: LlmGateway): Promise<void> {
  // Priority: human input
  if (s.humanQueue.length > 0) {
    await respondToHuman(s, llm);
    scheduleEvolution(s, llm);
    return;
  }

  // Respect human edits
  if (s.humanEdited && s.lastHumanTime && (Date.now() - s.lastHumanTime < HUMAN_GRACE)) {
    scheduleEvolution(s, llm);
    return;
  }

  s.evolveCount++;
  const baseMove = pickEvolutionMove(s);

  // ── Research phase: search the web for musical knowledge ──
  let research = null;
  try {
    s.send({ type: 'thinking', phase: 'evolving', message: `🔍 Researching patterns for evolution #${s.evolveCount}...` });
    research = await researchForEvolution(
      s.currentCode, s.skill!, s.vibeContext, s.evolveCount, llm,
    );
    if (research) {
      s.send({
        type: 'agent_log', phase: 'evolving',
        message: `📚 Learned: ${research.insight.slice(0, 120)}...`,
      });
    }
  } catch (e: any) {
    console.log(`[agent] research skipped: ${e.message}`);
  }

  // ── Evolution phase: apply move, enriched with research ──
  const enrichedMove = enrichEvolutionMove(baseMove, research);
  s.send({ type: 'thinking', phase: 'evolving', message: `Evolution #${s.evolveCount}: ${baseMove}` });

  const vibeExtra = s.vibeContext
    ? `\nVIBE: The listener wants "${s.vibeContext.originalVibe}" — ${s.vibeContext.mood} mood, ${s.vibeContext.energy} energy. Keep it aligned.`
    : '';

  const prompt = `Current code:
${s.currentCode}
${vibeExtra}

Musician move: ${enrichedMove}

Apply this ONE change. You may add a new $: voice, modify an existing voice, or tweak parameters. Keep all other voices intact.

Reply in this format:
REASON: (one sentence — describe how it will SOUND and FEEL, not technical details)
CODE:
(complete updated Strudel code — setcps line + all $: voices)`;

  try {
    const result = await llm.chat(buildEvolutionPrompt(s.skill!), [{ role: 'user', content: prompt }]);
    const { reason, code } = parseReasonCode(result);

    if (code && /\$\w+:/.test(code)) {
      s.currentCode = code;
      s.lastEvolveTime = Date.now();
      s.humanEdited = false;
      s.send({
        type: 'code_update', code, phase: 'evolving',
        message: `🎵 ${reason || baseMove}`,
      });
    }
  } catch (e: any) {
    console.error('[agent] evolution failed:', e.message);
  }

  scheduleEvolution(s, llm);
}

function pickEvolutionMove(s: Session): string {
  const needChange = s.lastRating !== null && s.lastRating <= 2;

  const subtle = [
    'Add subtle variation — ghost note, degradeBy, slight rhythm change on one voice',
    'Modulate a filter — add lpf with sine.range LFO on one voice',
    'Adjust the groove — tweak swing or fast/slow on one voice',
    'Add space — add .room() or .delay() to one voice',
    'Add movement — add .pan(sine.slow(N)) or rand.range to one voice',
    'Refine dynamics — adjust .gain() between voices',
  ];

  const bold = [
    'Add a new named voice ($kick:, $hat:, $snare:, $pad:, etc.) — a new instrument',
    'Introduce a new $melody: or $arp: voice with note() or n().scale()',
    'Remove the busiest voice — create space',
    'Shift mood — change notes or scale on melodic voices',
    'Add a new percussion voice ($hat:, $perc:, $rim:) with different rhythm',
    'Add a $chord: voice using chord().voicing() or a $pad: voice for texture',
  ];

  const pool = needChange ? bold : subtle;
  const idx = (s.evolveCount + Math.floor(Math.random() * 3)) % pool.length;
  return pool[idx];
}

// ═══════════════════════════════════════════════════
// Respond to human
// ═══════════════════════════════════════════════════

async function respondToHuman(s: Session, llm: LlmGateway): Promise<void> {
  const input = s.humanQueue.shift();
  if (!input) return;

  s.send({ type: 'thinking', phase: 'responding', message: `Hearing you: "${truncate(input.command, 60)}"` });

  const code = input.currentCode ?? s.currentCode;
  const vibeExtra = vibeCommandContext(input.command, s.vibeContext);

  const prompt = `Human says: "${input.command}"

Current code:
${code || '(nothing playing)'}
${vibeExtra}

The human might not know music terminology. Interpret their intent:
- "more chill" = slow down, reduce layers, lower filters
- "more energy" = add drums, open filters, increase gain
- "darker" = lower LPF, use minor scales, reduce brightness
- "brighter" = raise LPF, add higher frequencies
- "more interesting" = add variation, new voice, filter movement
- "simpler" = remove voices, reduce complexity
- "I like this" = keep direction, make subtle refinements
- "change it up" = make a bold change

Apply their request musically.

Reply in this format:
REASON: (one sentence — describe how it will SOUND and FEEL, not technical details)
CODE:
(complete updated Strudel code — setcps line + all $: voices)`;

  try {
    const result = await llm.chat(buildSystemPrompt(s.skill!), [{ role: 'user', content: prompt }]);
    const { reason, code: newCode } = parseReasonCode(result);

    if (newCode) {
      s.currentCode = newCode;
      s.lastEvolveTime = Date.now();
      s.lastHumanTime = Date.now();
      s.humanEdited = false;
      s.send({
        type: 'code_update', code: newCode, phase: 'responding',
        message: `💬 ${reason || 'Applied: ' + truncate(input.command, 60)}`,
      });
    }
  } catch (e: any) {
    console.error('[agent] human response failed:', e.message);
    s.send({ type: 'error', message: `Failed: ${e.message}` });
  }
}

// ═══════════════════════════════════════════════════
// System prompts
// ═══════════════════════════════════════════════════

function buildSystemPrompt(skill: Skill): string {
  const examples = skill.buildSequence
    .filter(s => s.code)
    .map(s => `// ${s.description}\n${s.code.trim()}`)
    .join('\n\n');

  return `You are a music copilot inside a Strudel live coding REPL.
Your listener may not know music terminology — always explain changes in plain, feelings-based language.

${getBaseKnowledge()}

## Genre Rules
${skill.rules}

## Example Voices
${examples}

When REASON+CODE format is requested, always include both.
REASON should be written for someone who doesn't know music — describe how it will SOUND and FEEL.`;
}

function buildEvolutionPrompt(skill: Skill): string {
  return buildSystemPrompt(skill) + `

## EVOLUTION RULES
- Make EXACTLY ONE musical change per evolution.
- You may: add a new named voice, modify one existing voice, or remove one voice.
- Keep all other voices exactly as they are — copy them unchanged.
- Build up the track gradually, like a live coder adding one element at a time.
- If you received RESEARCH INSIGHT, use it to make a more authentic, interesting change.`;
}

// ═══════════════════════════════════════════════════
// Utils
// ═══════════════════════════════════════════════════

function cleanCode(raw: string): string {
  return raw
    .replace(/```[a-z]*\s*/g, '')
    .replace(/```\s*/g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .trim();
}

function parseReasonCode(raw: string): { reason: string; code: string } {
  let reason = '';
  let code = raw;

  if (raw.includes('REASON:') && raw.includes('CODE:')) {
    reason = raw.substring(raw.indexOf('REASON:') + 7, raw.indexOf('CODE:')).trim();
    code = raw.substring(raw.indexOf('CODE:') + 5).trim();
  }

  return { reason, code: cleanCode(code) };
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '...' : s;
}
