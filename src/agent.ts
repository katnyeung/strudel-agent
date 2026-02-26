import type { LlmGateway } from './llm.js';
import type { Skill, Session, HumanInput, WsOutgoing } from './types.js';
import { allSkills, getSkill, getBaseKnowledge } from './skills.js';

/**
 * Copilot Agent — the brain of the system.
 *
 * Lifecycle:
 *   1. User picks a skill → bootstrap() with one simple voice
 *   2. Starts evolution loop — every 60s adds/modifies one $: voice
 *   3. Human can interrupt anytime → agent responds, then resumes evolving
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
    message: 'Pick a skill to start, or tell me what you want to hear.',
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
  s.send({
    type: 'agent_log', phase: 'bootstrap',
    message: `${skill.icon} ${skill.name} — starting up...`,
  });

  bootstrap(s, llm);
}

export function onCommand(id: string, command: string, currentCode: string | undefined, llm: LlmGateway): void {
  const s = sessions.get(id);
  if (!s) return;

  if (!s.skill) {
    s.skill = getSkill('lofi-dj') ?? allSkills()[0] ?? null;
    s.send({ type: 'agent_log', message: 'Defaulting to Lo-fi DJ...' });
    if (s.skill) bootstrap(s, llm);
  }

  s.humanQueue.push({ command, currentCode });

  // If evolving, respond immediately (evolution loop will notice queue is drained)
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
// Phase 1: BOOTSTRAP — start with one simple voice
// ═══════════════════════════════════════════════════

async function bootstrap(s: Session, llm: LlmGateway): Promise<void> {
  s.phase = 'bootstrapping';
  const skill = s.skill!;

  // Start with setcps + the skill's foundation voice — no LLM calls
  const cps = (skill.tempo.default / 60 / 4).toFixed(3);
  const foundation = skill.buildSequence.find(step => step.code);
  const firstVoice = foundation ? foundation.code.trim() : '$kick: s("bd").gain(0.6)';
  const startCode = `setcps(${cps})\n${firstVoice}`;

  s.currentCode = startCode;
  s.send({
    type: 'code_update', code: startCode, phase: 'bootstrap',
    message: `${skill.icon} Starting simple — evolution will build it up.`,
  });
  s.send({
    type: 'agent_log', phase: 'evolving',
    message: "I'll evolve this every ~60s. Talk to me anytime to steer the music.",
  });

  // Drain any queued commands
  if (s.humanQueue.length > 0) await respondToHuman(s, llm);

  startEvolutionLoop(s, llm);
}

// ═══════════════════════════════════════════════════
// Phase 2: EVOLUTION — continuous refinement with reasoning
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

  // Time to evolve
  s.evolveCount++;
  const move = pickEvolutionMove(s);

  s.send({ type: 'thinking', phase: 'evolving', message: `Evolution #${s.evolveCount}: ${move}` });

  const prompt = `Current code:
${s.currentCode}

Musician move: ${move}

Apply this ONE change. You may add a new $: voice, modify an existing voice, or tweak parameters. Keep all other voices intact.

Reply in this format:
REASON: (one sentence — your musical reasoning)
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
        message: `🎵 ${reason || move}`,
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

  const prompt = `Human says: "${input.command}"

Current code:
${code || '(nothing playing)'}

Apply their request musically. You may add, modify, or remove $: voices.

Reply in this format:
REASON: (one sentence — what you changed and why)
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

${getBaseKnowledge()}

## Genre Rules
${skill.rules}

## Example Voices
${examples}

When REASON+CODE format is requested, always include both.`;
}

function buildEvolutionPrompt(skill: Skill): string {
  return buildSystemPrompt(skill) + `

## EVOLUTION RULES
- Make EXACTLY ONE musical change per evolution.
- You may: add a new named voice, modify one existing voice, or remove one voice.
- Keep all other voices exactly as they are — copy them unchanged.
- Build up the track gradually, like a live coder adding one element at a time.`;
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
