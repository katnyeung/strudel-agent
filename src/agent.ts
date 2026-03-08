import type { LlmGateway } from './llm.js';
import type { Skill, BuildStep, Session, HumanInput, WsOutgoing, ChatMessage, TetrisConstraints, VocalState } from './types.js';
import { generateVocal, cleanupVocal } from './vocal.js';
import { allSkills, getSkill, getBaseKnowledge } from './skills.js';
import { MusicTheory } from './music-theory.js';
import * as neon from './db/neon.js';
import { parseSimpleVoices, countVoices, extractVoiceNames } from './db/voice-parser.js';
import { buildGraphContext } from './db/graph-context.js';
import { getSuggestedVoicesToAdd, getSuggestedVoicesToRemove, getBestTransitions } from './db/neo4j.js';
import type { VoiceSuggestion, TransitionCandidate } from './db/graph-types.js';

const theory = new MusicTheory();

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
    evolveInterval: EVOLVE_INTERVAL,
    evolveEnabled: false,
    voiceRatings: new Map(),
    humanQueue: [],
    history: [],
    tetrisActive: true,
    tetrisConstraints: null,
    pendingConstraints: null,
    llmInFlight: false,
    vocalStack: [],
    tetrisRandomSpeed: false,
  };
  sessions.set(id, session);

  neon.startSession({ id }).catch(e => console.error('[neon]', e.message));

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
  if (s) {
    neon.endSession(id, {
      total_evolves: s.evolveCount,
      final_code: s.currentCode || undefined,
    }).catch(e => console.error('[neon]', e.message));
  }
  if (s?.evolveTimer) clearTimeout(s.evolveTimer);
  for (const v of s?.vocalStack ?? []) cleanupVocal(v.sampleUrl);
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
  s.history = [];  // reset history for new skill
  // Tetris is always initialized on skill select (browser calls initTetris()),
  // so mark it active now so bootstrap waits for pieces instead of generating all voices
  s.tetrisActive = true;
  s.tetrisConstraints = null;
  s.pendingConstraints = null;
  neon.updateSessionSkill(id, skill.id, skill.name).catch(e => console.error('[neon]', e.message));
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

export function onRate(id: string, rating: number, voiceName?: string): void {
  const s = sessions.get(id);
  if (!s) return;

  if (voiceName) {
    // Per-voice rating
    s.voiceRatings.set(voiceName, rating);
    const voices = parseSimpleVoices(s.currentCode);
    const voice = voices.find(v => v.name === voiceName);
    neon.logRating({ session_id: id, rating, code_snapshot: s.currentCode || undefined, voice_name: voiceName, voice_type: voice?.type }).catch(e => console.error('[neon]', e.message));
    const emoji = rating <= 2 ? '👎' : rating >= 4 ? '👍' : '👌';
    s.send({
      type: 'agent_log',
      message: rating <= 2 ? `Rated $${voiceName} ${emoji} — will target this voice next evolution.`
             : rating >= 4 ? `Rated $${voiceName} ${emoji} — keeping this voice as-is.`
             : `Rated $${voiceName} ${emoji} — noted.`,
    });
  } else {
    // Overall rating (unchanged behavior)
    s.lastRating = rating;
    neon.logRating({ session_id: id, rating, code_snapshot: s.currentCode || undefined }).catch(e => console.error('[neon]', e.message));
    s.send({
      type: 'agent_log',
      message: rating >= 4 ? `Rated ${rating}/5 — keeping this direction, subtle refinements ahead.`
             : rating <= 2 ? `Rated ${rating}/5 — got it, next evolution will make a big change.`
             : `Rated ${rating}/5 — noted, will keep refining.`,
    });
  }
}

export function onSetEvolveInterval(id: string, intervalMs: number): void {
  const s = sessions.get(id);
  if (!s) return;
  s.evolveInterval = Math.max(10_000, Math.min(120_000, intervalMs));
  console.log(`[agent] evolve interval set to ${s.evolveInterval / 1000}s for ${id}`);
}

export function onEvolveNow(id: string, llm: LlmGateway): void {
  const s = sessions.get(id);
  if (!s || s.phase !== 'evolving') return;
  if (s.evolveTimer) clearTimeout(s.evolveTimer);
  evolutionTick(s, llm);
}

export function onToggleEvolve(id: string, enabled: boolean, llm: LlmGateway): void {
  const s = sessions.get(id);
  if (!s) return;
  s.evolveEnabled = enabled;
  if (enabled) {
    // Start evolution loop if we have a skill and are in evolving phase
    if (s.skill && s.phase === 'evolving' && !s.tetrisActive) {
      scheduleEvolution(s, llm);
    }
    console.log(`[agent] Evolution enabled for ${id}`);
  } else {
    if (s.evolveTimer) { clearTimeout(s.evolveTimer); s.evolveTimer = null; }
    console.log(`[agent] Evolution disabled for ${id}`);
  }
}

// ═══════════════════════════════════════════════════
// Tetris integration
// ═══════════════════════════════════════════════════

/** Piece key → voice name mapping */
const PIECE_TO_VOICE: Record<string, string> = {
  kick: 'kick', hat: 'hat', snare: 'snare',
  bass: 'bass', chord: 'chord', melody: 'melody', pad: 'pad',
};
const VOICE_TO_PIECE: Record<string, string> = {};
for (const [k, v] of Object.entries(PIECE_TO_VOICE)) VOICE_TO_PIECE[v] = k;
const ALL_PIECE_KEYS = Object.keys(PIECE_TO_VOICE);

export function onTetrisState(id: string, constraints: TetrisConstraints, llm: LlmGateway): void {
  const s = sessions.get(id);
  if (!s) return;

  // Mark Tetris active on first state message
  if (!s.tetrisActive) {
    s.tetrisActive = true;
    // Stop evolution loop — pieces drive regeneration
    if (s.evolveTimer) { clearTimeout(s.evolveTimer); s.evolveTimer = null; }
    console.log('[agent] Tetris mode activated');
  }

  s.tetrisConstraints = constraints;

  // Skip regeneration if board is empty (e.g. after restart, before first piece)
  if (!constraints.activeVoices || constraints.activeVoices.length === 0) {
    return;
  }

  // Debounce: if LLM call in flight, store as pending
  if (s.llmInFlight) {
    s.pendingConstraints = constraints;
    return;
  }

  regenerateFromConstraints(s, llm);

  // Predict next piece for the browser
  predictNextPiece(s);
}

export function onTetrisRestart(id: string, llm: LlmGateway): void {
  const s = sessions.get(id);
  if (!s) return;
  s.tetrisConstraints = null;
  s.pendingConstraints = null;
  s.send({ type: 'agent_log', message: 'Tetris reset — waiting for first piece...' });
}

export function onTetrisRandomSpeed(id: string, enabled: boolean): void {
  const s = sessions.get(id);
  if (!s) return;
  s.tetrisRandomSpeed = enabled;
  console.log(`[agent] Tetris random speed: ${enabled}`);
}

function computeTetrisSpeed(constraints: TetrisConstraints): number {
  const cells = constraints.totalCells;
  // Few cells (<5) → fast drops (~400-700ms), rushing to fill the board
  // Medium (5-20) → moderate (~800-2000ms)
  // Dense (>20) → slower base (~2000-4000ms) with heavy randomness
  const base = 400 + (cells * 120);
  const jitterRange = cells > 20 ? 0.5 : cells > 10 ? 0.25 : 0.1;
  const jitter = 1 - jitterRange + Math.random() * jitterRange * 2;
  return Math.max(300, Math.min(5000, Math.round(base * jitter)));
}

const MAX_VOCAL_STACK = 4;

export async function onCombo(id: string, comboCount: number, llm: LlmGateway): Promise<void> {
  const s = sessions.get(id);
  if (!s || !s.skill) return;

  // If stack is full, remove the oldest vocal
  if (s.vocalStack.length >= MAX_VOCAL_STACK) {
    const oldest = s.vocalStack.shift()!;
    cleanupVocal(oldest.sampleUrl);
    console.log(`[agent] Vocal stack full, removed oldest: "${oldest.word}"`);
  }

  const slotIndex = s.vocalStack.length;
  const sampleName = `vocal${slotIndex}`;

  console.log(`[agent] Combo x${comboCount} — generating vocal phrase (slot ${sampleName})`);
  s.send({ type: 'agent_log', message: `Combo x${comboCount}! Generating vocal phrase...` });

  try {
    // LLM generates a short spoken phrase fitting the genre mood
    const phrasePrompt = `Write a short spoken phrase (3-8 words) that fits the mood of ${s.skill.name} music. This will be spoken aloud as a vocal sample layered into the track — like a DJ drop, a poetic whisper, or a hypnotic mantra. Reply with ONLY the phrase, nothing else.`;
    const phrase = (await llm.chat(
      `You are a music producer writing vocal phrases for electronic/ambient tracks. Write evocative, atmospheric phrases — not just single words. Examples: "lost in the echo", "we drift through the static", "breathe into the night", "feel the pulse rising". Reply with only the phrase.`,
      [{ role: 'user', content: phrasePrompt }],
      60,
    )).trim().replace(/[^a-zA-Z\s'-]/g, '').slice(0, 80) || 'lost in the echo';

    const { url } = await generateVocal(phrase);
    const vocal: VocalState = {
      word: phrase,
      sampleUrl: url,
      sampleName,
      comboSize: comboCount,
      ticksAlive: 0,
      maxTicks: comboCount >= 10 ? 8 : 5,
      injected: false,
    };
    s.vocalStack.push(vocal);
    s.send({ type: 'vocal_ready', sampleUrl: url, word: phrase, sampleName, message: `Vocal "${phrase}" ready as ${sampleName} — will be woven into next evolution` });
    console.log(`[agent] Vocal "${phrase}" ready at ${url} as ${sampleName}, maxTicks=${vocal.maxTicks}`);
  } catch (e: any) {
    console.error('[agent] Vocal generation failed:', e.message);
    s.send({ type: 'agent_log', message: `Vocal generation failed: ${e.message}` });
  }
}

async function regenerateFromConstraints(s: Session, llm: LlmGateway): Promise<void> {
  if (!s.skill || !s.tetrisConstraints) return;
  const constraints = s.tetrisConstraints;

  s.llmInFlight = true;
  s.send({ type: 'thinking', phase: 'evolving', message: `Regenerating with constraints: ${constraints.activeVoices.join(', ')} (${constraints.totalCells} cells)` });
  console.log(`[agent] Regenerating with constraints:`, constraints.voices);

  const constraintBlock = buildConstraintBlock(constraints, s.vocalStack.length > 0);
  const theoryCtx = buildTheoryContext(s.skill, constraints.activeVoices.join(' '));
  const vocalCtx = buildVocalContext(s);

  const ratingCtx = s.lastRating !== null
    ? `\nListener feedback: rated ${s.lastRating}/5${s.lastRating <= 2 ? ' — they don\'t like the current direction, make a significant change' : s.lastRating >= 4 ? ' — they like this direction, keep the vibe' : ''}\n`
    : '';
  // Consume the overall rating — it's one-shot feedback for this cycle
  s.lastRating = null;

  let voiceCtx = '';
  if (s.voiceRatings.size > 0) {
    const lines: string[] = [];
    for (const [name, vr] of s.voiceRatings) {
      if (vr <= 2) lines.push(`$${name}: disliked — change its sound, rhythm, or pattern`);
      else if (vr >= 4) lines.push(`$${name}: liked — keep it as-is`);
      else lines.push(`$${name}: neutral`);
    }
    voiceCtx = `\nPer-voice feedback (one-time, applied this cycle only):\n${lines.join('\n')}\n`;
  }
  // Consume voice ratings after building the prompt — they're one-shot feedback
  s.voiceRatings.clear();

  const range = cpsRange(s.skill);

  const voiceList = constraints.activeVoices.map(v => `$${v}`).join(', ');

  const prompt = `${constraintBlock}

IMPORTANT: Output ONLY these voices: ${voiceList}. Do NOT output any other voices.
${theoryCtx}${ratingCtx}${voiceCtx}
Generate Strudel code for ${s.skill.name} using ONLY the allowed voices above.
Each voice's note count must not exceed its cell count.
TEMPO: setcps() uses cycles-per-second, NOT BPM. Formula: BPM/60/4.
Valid range: setcps(${range.min}) to setcps(${range.max}).
Example: 78 BPM = setcps(${range.default}), NOT setcps(78).
${vocalCtx}
Reply in this EXACT format:
REASON: (one sentence about your musical choice)
CODE:
setcps(value between ${range.min} and ${range.max})
${constraints.activeVoices.map(v => `$${v}: ...`).join('\n')}`;

  try {
    // Tetris regeneration is stateless — no history needed.
    // Current code is already in the prompt, history just wastes tokens.
    const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
    const systemPrompt = buildTetrisSystemPrompt(s.skill!, constraints.activeVoices, llm.provider);
    const result = await llm.chat(systemPrompt, messages);
    console.log('[agent] LLM raw response (first 300 chars):', result.substring(0, 300));
    const { reason, code: rawCode } = parseReasonCode(result);
    console.log('[agent] Parsed reason:', reason || '(empty)');
    // Always enforce correct cps — LLM often writes BPM instead
    const fixedCode = rawCode ? fixCps(rawCode, s.skill!) : rawCode;
    // Strip any voices not in constraints (small models ignore instructions)
    const code = fixedCode ? filterToAllowedVoices(fixedCode, constraints.activeVoices, s.vocalStack) : fixedCode;

    if (code && /\$\w+:/.test(code)) {
      const codeBefore = s.currentCode;
      s.currentCode = code;
      const voices = parseSimpleVoices(code);
      cleanStaleVoiceRatings(s, voices);
      neon.logEvolution({ session_id: s.id, phase: 'tetris', code_before: codeBefore, code_after: code, voices, voice_count: voices.length, reason }).catch(e => console.error('[neon]', e.message));
      updateVocalStack(s, code);
      s.send({
        type: 'code_update', code, phase: 'evolving',
        message: `🎮 ${reason || 'Regenerated from Tetris constraints'}`,
      });

      if (s.tetrisRandomSpeed && s.tetrisConstraints) {
        const speedMs = computeTetrisSpeed(s.tetrisConstraints);
        s.send({ type: 'tetris_set_speed', speedMs });
      }
    }
  } catch (e: any) {
    console.error('[agent] tetris regeneration failed:', e.message);
    s.send({ type: 'error', message: `Regeneration failed: ${e.message}` });
  }

  s.llmInFlight = false;

  // Process pending constraints if any
  if (s.pendingConstraints) {
    const pending = s.pendingConstraints;
    s.pendingConstraints = null;
    s.tetrisConstraints = pending;
    if (pending.activeVoices.length > 0) {
      regenerateFromConstraints(s, llm);
    }
  }
}

function buildVocalContext(s: Session): string {
  if (s.vocalStack.length === 0) return '';

  const sections: string[] = [];
  const toInject = s.vocalStack.filter(v => !v.injected);
  const active = s.vocalStack.filter(v => v.injected && v.ticksAlive < v.maxTicks);
  const expired = s.vocalStack.filter(v => v.injected && v.ticksAlive >= v.maxTicks);

  if (toInject.length > 0) {
    const examples = toInject.map(v =>
      `$${v.sampleName}: s("${v.sampleName}").loopAt(2).chop(16).sometimes(rev).degradeBy(0.3).room(0.6).gain(0.45)`
    ).join('\n');
    sections.push(`## MANDATORY — INJECT NEW VOCALS
${toInject.length} new vocal sample(s) are pre-loaded. You MUST add each as a voice.
The sample name inside s() MUST be exactly: ${toInject.map(v => `"${v.sampleName}"`).join(', ')}
NEVER put the spoken phrase inside s(). ONLY use the sample name.
WRONG: s("feel the rhythm") — this will not work
CORRECT: s("${toInject[0].sampleName}") — use this exact name

Copy one of these lines exactly:
${examples}

Add them as the LAST voice lines. These are NOT Tetris voices — they are bonus combo vocals.`);
  }

  if (active.length > 0) {
    const keepList = active.map(v => `$${v.sampleName} (${v.maxTicks - v.ticksAlive} ticks left)`).join(', ');
    sections.push(`## MANDATORY — KEEP ACTIVE VOCALS
Keep these vocal voices in your output: ${keepList}
Use s("${active[0].sampleName}") — the EXACT sample name, not the spoken phrase.
You may change their effects. Do NOT remove them yet.`);
  }

  if (expired.length > 0) {
    const removeList = expired.map(v => `$${v.sampleName}`).join(', ');
    sections.push(`## MANDATORY — REMOVE EXPIRED VOCALS
Remove these vocal voices: ${removeList}. They have expired.`);
  }

  return '\n' + sections.join('\n\n') + '\n';
}

function updateVocalStack(s: Session, code: string): void {
  for (const v of s.vocalStack) {
    if (!v.injected && code.includes(`$${v.sampleName}:`)) {
      v.injected = true;
      // Don't count the injection tick — decay starts next regeneration
      continue;
    }
    if (v.injected) {
      v.ticksAlive++;
    }
  }

  // Remove expired vocals
  const expired = s.vocalStack.filter(v => v.injected && v.ticksAlive >= v.maxTicks);
  for (const v of expired) {
    cleanupVocal(v.sampleUrl);
    console.log(`[agent] Vocal "${v.word}" (${v.sampleName}) decayed and cleaned up`);
  }
  s.vocalStack = s.vocalStack.filter(v => !(v.injected && v.ticksAlive >= v.maxTicks));
}

function densityHint(voice: string, count: number): string {
  const isDrum = ['kick', 'snare', 'hat', 'perc', 'rim'].includes(voice);
  if (isDrum) {
    // Drums: more cells = more beat positions in 16-step grid
    if (count >= 16) return `→ dense: use 8-12 beat positions`;
    if (count >= 8) return `→ medium: use 4-8 beat positions`;
    if (count >= 4) return `→ light: use 2-4 beat positions`;
    return `→ sparse: use 1-2 beat positions`;
  }
  // Melodic: more cells = more notes (power-of-2)
  if (count >= 12) return `→ use 8 notes (rich pattern)`;
  if (count >= 6) return `→ use 4 notes`;
  if (count >= 3) return `→ use 2 notes`;
  return `→ use 1 note`;
}

function buildConstraintBlock(constraints: TetrisConstraints, hasVocal = false): string {
  const lines = constraints.activeVoices.map(v => {
    const count = constraints.voices[v] || 0;
    const hint = densityHint(v, count);
    return `- $${v}: ${count} cells ${hint}`;
  });
  const vocalNote = hasVocal
    ? '\nException: $vocalN: voices are EXEMPT from these constraints — they come from combo vocal samples, not Tetris pieces. Always include them when the VOCAL section says so.'
    : '';
  return `## TETRIS CONSTRAINTS (STRICT)
Allowed voices (more cells = denser/richer patterns):
${lines.join('\n')}
Do NOT use any voice type not listed here.
Drums: use .beat(positions, 16) — scale the number of positions with cell count.
Melodic/bass/pad: use power-of-2 note counts (1, 2, 4, or 8) with ~ rests. Pick the largest power-of-2 that fits the cell count.${vocalNote}
Total cells: ${constraints.totalCells}`;
}

async function predictNextPiece(s: Session): Promise<void> {
  // 70% Neo4j suggestion, 30% random
  if (Math.random() < 0.3) {
    const key = ALL_PIECE_KEYS[Math.floor(Math.random() * ALL_PIECE_KEYS.length)];
    s.send({ type: 'tetris_next_piece', pieceKey: key });
    return;
  }

  try {
    const currentVoices = s.tetrisConstraints?.activeVoices || [];
    const suggestions = await getSuggestedVoicesToAdd(s.skill!.id, currentVoices, 1, 5);
    if (suggestions.length > 0) {
      // Pick weighted by rating
      const pick = suggestions[Math.floor(Math.random() * Math.min(3, suggestions.length))];
      const pieceKey = VOICE_TO_PIECE[pick.voice_name];
      if (pieceKey) {
        s.send({ type: 'tetris_next_piece', pieceKey });
        console.log(`[agent] Neo4j suggests next piece: ${pieceKey} (${pick.voice_name})`);
        return;
      }
    }
  } catch (e: any) {
    console.error('[agent] Neo4j prediction failed:', e.message);
  }

  // Fallback: random
  const key = ALL_PIECE_KEYS[Math.floor(Math.random() * ALL_PIECE_KEYS.length)];
  s.send({ type: 'tetris_next_piece', pieceKey: key });
}

// ═══════════════════════════════════════════════════
// Board command classification (for human commands when Tetris active)
// ═══════════════════════════════════════════════════

const BOARD_ADD_RE = /\b(?:add|more|spawn|drop|give me|want)\s+(?:a\s+)?(\w+)/i;
const BOARD_REMOVE_RE = /\b(?:remove|delete|clear|kill|drop|no more)\s+(?:the\s+)?(?:all\s+)?(\w+)/i;
const VOICE_NAMES = new Set(['kick', 'hat', 'snare', 'bass', 'chord', 'melody', 'pad', 'bd', 'hh']);

interface BoardCommand {
  action: 'add' | 'remove' | 'music';
  voice?: string;
}

function classifyBoardCommand(command: string): BoardCommand {
  // Try "remove" first (more specific)
  const removeMatch = command.match(BOARD_REMOVE_RE);
  if (removeMatch) {
    const word = removeMatch[1].toLowerCase();
    if (VOICE_NAMES.has(word)) return { action: 'remove', voice: word };
    // Alias: bd→kick, hh→hat
    if (word === 'bd') return { action: 'remove', voice: 'kick' };
    if (word === 'hh') return { action: 'remove', voice: 'hat' };
  }

  // Try "add"
  const addMatch = command.match(BOARD_ADD_RE);
  if (addMatch) {
    const word = addMatch[1].toLowerCase();
    if (VOICE_NAMES.has(word)) return { action: 'add', voice: word };
    if (word === 'bd') return { action: 'add', voice: 'kick' };
    if (word === 'hh') return { action: 'add', voice: 'hat' };
  }

  return { action: 'music' };
}

// ═══════════════════════════════════════════════════
// Phase 1: BOOTSTRAP — start with one simple voice
// ═══════════════════════════════════════════════════

async function bootstrap(s: Session, llm: LlmGateway): Promise<void> {
  s.phase = 'bootstrapping';
  const skill = s.skill!;

  const bpm = skill.tempo.default ?? skill.tempo.min;
  const cps = (bpm / 60 / 4).toFixed(3);

  // Tetris mode: skip LLM call — just set tempo and wait for pieces
  if (s.tetrisActive) {
    const startCode = `setcps(${cps})`;
    s.currentCode = startCode;
    s.send({
      type: 'code_update', code: startCode, phase: 'bootstrap',
      message: `${skill.icon} ${skill.name} at ${bpm} BPM — Tetris pieces will build the music.`,
    });
    s.send({
      type: 'agent_log', phase: 'evolving',
      message: "Tetris is driving the music — pieces = instruments. Talk to me anytime.",
    });
    s.phase = 'evolving';
    if (s.humanQueue.length > 0) await respondToHuman(s, llm);
    return;
  }

  // Normal mode: generate a first beat via LLM
  s.send({ type: 'thinking', phase: 'bootstrap', message: `Generating a fresh ${skill.name} beat at ${bpm} BPM...` });

  const theoryCtx = buildTheoryContext(skill, 'chord melody bass kick');

  const prompt = `Generate a fresh starting pattern for ${skill.name} at ${bpm} BPM.
Pick a random key from: C, D, F, G, A — don't always use the same one.
Start with 2-3 voices (e.g. a rhythm + a harmonic element). Keep it simple but musical.
Make it sound different each time — vary the rhythms, chord voicings, sound choices, effects.
Add .color("colorname") to every voice for visual distinction. Add ._pianoroll() to one melodic voice.
${theoryCtx}
Reply in this format:
REASON: (one sentence — what you chose and why)
CODE:
setcps(${cps})
(2-3 $name: voices)`;

  try {
    const result = await llm.chat(buildSystemPrompt(skill, false, llm.provider), [{ role: 'user', content: prompt }]);
    const { reason, code } = parseReasonCode(result);

    if (code && /\$\w+:/.test(code)) {
      s.currentCode = code;
      addHistory(s, 'user', prompt);
      addHistory(s, 'assistant', `REASON: ${reason}\nCODE:\n${code}`);
      const voices = parseSimpleVoices(code);
      neon.logEvolution({ session_id: s.id, phase: 'bootstrap', code_after: code, voices, voice_count: voices.length, reason }).catch(e => console.error('[neon]', e.message));
      s.send({
        type: 'code_update', code, phase: 'bootstrap',
        message: `${skill.icon} ${reason || `Fresh ${skill.name} beat — evolution will build it up.`}`,
      });
    } else {
      // Fallback: use build-sequence foundation
      const foundation = skill.buildSequence.find(step => step.code);
      const firstVoice = foundation?.code ? foundation.code.trim() : '$kick: s("bd").gain(0.6)';
      const startCode = `setcps(${cps})\n${firstVoice}`;
      s.currentCode = startCode;
      const voices = parseSimpleVoices(startCode);
      neon.logEvolution({ session_id: s.id, phase: 'bootstrap', code_after: startCode, voices, voice_count: voices.length, reason: 'Fallback — LLM returned no valid code' }).catch(e => console.error('[neon]', e.message));
      s.send({
        type: 'code_update', code: startCode, phase: 'bootstrap',
        message: `${skill.icon} Starting simple — evolution will build it up.`,
      });
    }
  } catch (e: any) {
    console.error('[agent] bootstrap LLM failed:', e.message);
    // Fallback: use build-sequence foundation
    const foundation = skill.buildSequence.find(step => step.code);
    const firstVoice = foundation?.code ? foundation.code.trim() : '$kick: s("bd").gain(0.6)';
    const startCode = `setcps(${cps})\n${firstVoice}`;
    s.currentCode = startCode;
    const voices = parseSimpleVoices(startCode);
    neon.logEvolution({ session_id: s.id, phase: 'bootstrap', code_after: startCode, voices, voice_count: voices.length, reason: 'Fallback — LLM error' }).catch(e => console.error('[neon]', e.message));
    s.send({
      type: 'code_update', code: startCode, phase: 'bootstrap',
      message: `${skill.icon} Starting simple — evolution will build it up.`,
    });
  }

  s.send({
    type: 'agent_log', phase: 'evolving',
    message: s.evolveEnabled
      ? "I'll evolve this every ~60s. Talk to me anytime to steer the music."
      : "Evolution is off. Enable it with the checkbox, or talk to me anytime.",
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
  if (!s.evolveEnabled) return;
  s.evolveTimer = setTimeout(() => evolutionTick(s, llm), s.evolveInterval);
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
  const move = await pickEvolutionMove(s);

  s.send({ type: 'thinking', phase: 'evolving', message: `Evolution #${s.evolveCount}: ${move}` });

  const theoryCtx = buildTheoryContext(s.skill!, move);

  const ratingCtx = s.lastRating !== null
    ? `\nListener feedback: rated ${s.lastRating}/5${s.lastRating <= 2 ? ' — they don\'t like the current direction, make a significant change' : s.lastRating >= 4 ? ' — they like this direction, keep the vibe' : ''}\n`
    : '';

  // Build per-voice feedback context
  let voiceCtx = '';
  if (s.voiceRatings.size > 0) {
    const lines: string[] = [];
    for (const [name, vr] of s.voiceRatings) {
      if (vr <= 2) lines.push(`$${name}: disliked — change or remove it`);
      else if (vr >= 4) lines.push(`$${name}: liked — keep it`);
      else lines.push(`$${name}: neutral`);
    }
    voiceCtx = `\nPer-voice feedback:\n${lines.join('\n')}\n`;
  }

  const vocalCtx = buildVocalContext(s);

  const evolveRange = cpsRange(s.skill!);
  const currentCpsVal = extractCps(s.currentCode) || evolveRange.default;

  const prompt = `Current code:
${s.currentCode}

Musician move: ${move}
${theoryCtx}${ratingCtx}${voiceCtx}${vocalCtx}
Apply this ONE change. You may add a new $: voice, modify an existing voice, or tweak parameters. Keep all other voices intact.
TEMPO: Keep setcps(${currentCpsVal}) or vary slightly within ${evolveRange.min}-${evolveRange.max}.
setcps uses cycles-per-second (NOT BPM). NEVER put BPM in setcps.

Reply in this format:
REASON: (one sentence — your musical reasoning)
CODE:
(complete updated Strudel code — setcps line + all $: voices)`;

  const codeBefore = s.currentCode;

  try {
    const messages: ChatMessage[] = [...getHistory(s, llm.provider), { role: 'user', content: prompt }];
    const result = await llm.chat(await buildEvolutionPrompt(s.skill!, s.currentCode, llm.provider), messages);
    const { reason, code: rawCode } = parseReasonCode(result);
    const code = rawCode ? fixCps(rawCode, s.skill!) : rawCode;

    if (code && /\$\w+:/.test(code)) {
      s.currentCode = code;
      s.lastEvolveTime = Date.now();
      s.humanEdited = false;
      addHistory(s, 'user', prompt);
      addHistory(s, 'assistant', `REASON: ${reason}\nCODE:\n${code}`);
      const voices = parseSimpleVoices(code);
      cleanStaleVoiceRatings(s, voices);
      updateVocalStack(s, code);
      neon.logEvolution({ session_id: s.id, phase: 'evolving', move_type: move, code_before: codeBefore, code_after: code, voices, voice_count: voices.length, reason }).catch(e => console.error('[neon]', e.message));
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

async function pickEvolutionMove(s: Session): Promise<string> {
  // Priority 1: fix disliked voices (one per cycle)
  for (const [name, vr] of s.voiceRatings) {
    if (vr <= 2) {
      s.voiceRatings.delete(name);
      return `Replace or rework the $${name}: voice — the listener specifically dislikes it. Change its sound, rhythm, or remove it entirely.`;
    }
  }

  // Priority 2: refine neutral-rated voices (~50% chance per cycle)
  const neutralVoices = [...s.voiceRatings.entries()].filter(([, vr]) => vr === 3);
  if (neutralVoices.length > 0 && Math.random() < 0.5) {
    const [name] = neutralVoices[Math.floor(Math.random() * neutralVoices.length)];
    s.voiceRatings.delete(name);
    const refineMoves = [
      `Refine the $${name}: voice — try a different rhythm pattern or timing`,
      `Refine the $${name}: voice — change its sound/sample to something more interesting`,
      `Refine the $${name}: voice — add or change its filter, effects, or modulation`,
      `Refine the $${name}: voice — change its notes, pitch, or melodic pattern`,
    ];
    return refineMoves[Math.floor(Math.random() * refineMoves.length)];
  }

  const rating = s.lastRating;

  // Priority 3: query graph for data-driven moves
  if (s.skill && s.currentCode) {
    try {
      const currentVoices = extractVoiceNames(s.currentCode);
      if (currentVoices.length > 0) {
        const [transitions, toAdd, toRemove] = await Promise.all([
          getBestTransitions(s.skill.id, currentVoices, 1, 5),
          getSuggestedVoicesToAdd(s.skill.id, currentVoices, 2, 5),
          currentVoices.length >= 4 ? getSuggestedVoicesToRemove(s.skill.id, currentVoices, 2, 3) : Promise.resolve([]),
        ]);

        // Prefer transition data (exact path from current state) over suggestions
        const transitionMove = pickTransitionMove(transitions, currentVoices);
        if (transitionMove) return transitionMove;

        // Fall back to voice suggestions (array containment)
        const suggestion = pickVoiceSuggestion(toAdd, toRemove, currentVoices.length);
        if (suggestion) return suggestion;
      }
    } catch (e: any) {
      console.error('[agent] graph query failed, falling back to random:', e.message);
    }
  }

  // Priority 4: random pool fallback (cold start)
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

  const dislike = [
    'Change the key or scale — shift the entire harmonic mood',
    'Replace the rhythm entirely — try a different drum pattern and groove',
    'Change the sound palette — swap synth sounds, samples, or banks on multiple voices',
    'Rethink the texture — change reverb, delay, filter approach across voices',
    'Try a completely different instrument or tone — replace one voice with a new gm_ sound or synth type',
    'Change the chord progression or melody — try new notes, different intervals, or a new harmonic idea',
  ];

  // Bad rating (1-2): drastic change, then reset rating so it doesn't repeat
  if (rating !== null && rating <= 2) {
    s.lastRating = null;
    const idx = Math.floor(Math.random() * dislike.length);
    return dislike[idx];
  }

  // Good rating (4-5): keep subtle, preserve direction
  // Neutral (3) or no rating: mix of subtle + occasional bold
  let pool: string[];
  if (rating !== null && rating >= 4) {
    pool = subtle;
  } else {
    // Gradually introduce bold moves as evolve count grows
    pool = s.evolveCount <= 3 ? bold : [...subtle, ...subtle, ...bold];
  }

  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx];
}

/** Pick a move from transition history. Prefers high success_rate × improvement. */
function pickTransitionMove(
  transitions: TransitionCandidate[],
  currentVoices: string[],
): string | null {
  if (transitions.length === 0) return null;

  // Weighted random: success_rate × (1 + max(0, improvement) * 0.5)
  const weights = transitions.map(t =>
    t.success_rate * (1 + Math.max(0, t.avg_improvement ?? 0) * 0.5)
  );
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;

  let r = Math.random() * total;
  for (let i = 0; i < transitions.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      const t = transitions[i];
      const added = t.to_voices.filter(v => !currentVoices.includes(v));
      const removed = currentVoices.filter(v => !t.to_voices.includes(v));
      const changes = [
        ...added.map(v => `Add $${v}:`),
        ...removed.map(v => `Remove $${v}:`),
      ].join(', ');
      const ratingStr = t.avg_rating_after != null ? `, avg rating ~${t.avg_rating_after.toFixed(1)}` : '';
      return `${changes} voice. Past data: ${(t.success_rate * 100).toFixed(0)}% success rate across ${t.count} tries${ratingStr}`;
    }
  }

  return null;
}

/** Pick a voice suggestion from graph data. Returns a move string or null. */
function pickVoiceSuggestion(
  toAdd: VoiceSuggestion[],
  toRemove: VoiceSuggestion[],
  currentCount: number,
): string | null {
  // With many voices (5+), occasionally suggest removal
  if (currentCount >= 5 && toRemove.length > 0 && Math.random() < 0.3) {
    const pick = toRemove[Math.floor(Math.random() * toRemove.length)];
    return `Remove the $${pick.voice_name}: voice — create space. Past data: simpler states without it rated avg ${pick.avg_rating?.toFixed(1) ?? 'N/A'}`;
  }

  if (toAdd.length > 0) {
    // Weighted by rating
    const weights = toAdd.map(s => Math.max(0, s.avg_rating ?? 0));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return null;

    let r = Math.random() * total;
    for (let i = 0; i < toAdd.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        const pick = toAdd[i];
        return `Add a new $${pick.voice_name}: voice. Past data: states with this voice rated avg ${pick.avg_rating?.toFixed(1) ?? 'N/A'}, best ${pick.best_rating ?? 'N/A'} (seen ${pick.appearances} times)`;
      }
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════
// Respond to human
// ═══════════════════════════════════════════════════

async function respondToHuman(s: Session, llm: LlmGateway): Promise<void> {
  const input = s.humanQueue.shift();
  if (!input) return;

  s.send({ type: 'thinking', phase: 'responding', message: `Hearing you: "${truncate(input.command, 60)}"` });

  // ── Tetris board command handling ──
  if (s.tetrisActive) {
    const cmd = classifyBoardCommand(input.command);
    if (cmd.action === 'add' && cmd.voice) {
      const pieceKey = VOICE_TO_PIECE[cmd.voice] || cmd.voice;
      if (ALL_PIECE_KEYS.includes(pieceKey)) {
        s.send({ type: 'tetris_spawn_piece', pieceKey });
        s.send({ type: 'agent_log', phase: 'responding', message: `Spawning ${cmd.voice} piece on the board...` });
        // Also respond musically within current constraints
      } else {
        s.send({ type: 'agent_log', message: `Unknown voice "${cmd.voice}" — treating as music command.` });
      }
    } else if (cmd.action === 'remove' && cmd.voice) {
      s.send({ type: 'tetris_remove_voice', voiceName: cmd.voice });
      s.send({ type: 'agent_log', phase: 'responding', message: `Removing ${cmd.voice} from the board...` });
      // Browser will remove cells and send updated tetris_state → triggers regeneration
      neon.logCommand({ session_id: s.id, command: input.command }).catch(e => console.error('[neon]', e.message));
      return;
    }
    // For 'music' or 'add' (which also gets a music response), fall through with constraints
  }

  const code = input.currentCode ?? s.currentCode;
  const theoryCtx = s.skill ? buildTheoryContext(s.skill, input.command) : '';
  const constraintCtx = s.tetrisActive && s.tetrisConstraints
    ? '\n' + buildConstraintBlock(s.tetrisConstraints, s.vocalStack.length > 0) + '\n'
    : '';

  const humanRange = s.skill ? cpsRange(s.skill) : null;
  const humanCurrentCps = extractCps(code) || humanRange?.default;
  const humanCpsLine = humanRange
    ? `TEMPO: Keep setcps(${humanCurrentCps}) unless the human asks for a tempo change. Valid range: ${humanRange.min}-${humanRange.max}.\nsetcps uses cycles-per-second (NOT BPM). NEVER put BPM in setcps.`
    : '';

  const prompt = `Human says: "${input.command}"

Current code:
${code || '(nothing playing)'}
${theoryCtx}${constraintCtx}
Apply their request musically. You may add, modify, or remove $: voices.${
  s.tetrisActive ? '\nRespect the TETRIS CONSTRAINTS above — only use allowed voices.' : ''
}
${humanCpsLine}

Reply in this format:
REASON: (one sentence — what you changed and why)
CODE:
(complete updated Strudel code — setcps line + all $: voices)`;

  try {
    const messages: ChatMessage[] = [...getHistory(s, llm.provider), { role: 'user', content: prompt }];
    const result = await llm.chat(buildSystemPrompt(s.skill!, false, llm.provider), messages);
    const { reason, code: rawNewCode } = parseReasonCode(result);
    // Fix cps unless user explicitly asked for tempo change
    const isTempCmd = /\b(tempo|bpm|speed|faster|slower|cps)\b/i.test(input.command);
    const newCode = rawNewCode && s.skill && !isTempCmd ? fixCps(rawNewCode, s.skill) : rawNewCode;

    if (newCode) {
      const codeBefore = code;
      s.currentCode = newCode;
      s.lastEvolveTime = Date.now();
      s.lastHumanTime = Date.now();
      s.humanEdited = false;
      addHistory(s, 'user', prompt);
      addHistory(s, 'assistant', `REASON: ${reason}\nCODE:\n${newCode}`);
      cleanStaleVoiceRatings(s, parseSimpleVoices(newCode));
      neon.logCommand({ session_id: s.id, command: input.command, code_before: codeBefore, code_after: newCode }).catch(e => console.error('[neon]', e.message));
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

function isSmallModel(provider: string): boolean {
  return provider.toLowerCase() === 'ollama';
}

function buildSystemPrompt(skill: Skill, compact = false, provider = ''): string {
  const small = isSmallModel(provider);
  const knowledgeLevel = small ? 'compact' : (compact ? 'core' : 'full');
  const examples = skill.buildSequence
    .filter((s): s is BuildStep & { code: string } => !!s.code)
    .map(s => `// ${s.description}\n${s.code.trim()}`)
    .join('\n\n');

  return `You are a music copilot inside a Strudel live coding REPL.
${small ? '\nIMPORTANT: Output ONLY Strudel code. NEVER write JavaScript functions, variables, or comments. Each line starts with $name: followed by a method chain.\n' : ''}
${getBaseKnowledge(knowledgeLevel)}

## Genre Rules
${skill.rules}

## Example Voices
${examples}

When REASON+CODE format is requested, always include both.`;
}

function buildTetrisSystemPrompt(skill: Skill, allowedVoices: string[], provider = ''): string {
  const small = isSmallModel(provider);
  const knowledgeLevel = small ? 'compact' : 'core';

  // Only include examples that match allowed voice names
  const allowedSet = new Set(allowedVoices);
  const examples = skill.buildSequence
    .filter((s): s is BuildStep & { code: string } => !!s.code)
    .filter(s => {
      const voiceMatch = s.code.match(/\$(\w+):/);
      return voiceMatch && allowedSet.has(voiceMatch[1]);
    })
    .map(s => s.code.trim())
    .join('\n');

  const voiceList = allowedVoices.map(v => `$${v}`).join(', ');

  return `You are a music copilot inside a Strudel live coding REPL.

CRITICAL RULE: You may ONLY output these voices: ${voiceList}
Any other voice ($kick, $bass, $snare, etc.) is FORBIDDEN unless listed above.
Output ONLY the allowed voices. Do NOT copy voices from examples that are not in the allowed list.

${getBaseKnowledge(knowledgeLevel)}

## Genre Rules
${skill.rules}

${examples ? `## Example Voices (for reference — only use allowed voices)\n${examples}` : ''}

Always output in REASON: / CODE: format.`;
}

/** Remove any $voice: lines not in the allowed list (safety net for small models) */
function filterToAllowedVoices(code: string, allowedVoices: string[], vocalStack: VocalState[]): string {
  const allowed = new Set(allowedVoices);
  // Also allow vocal voices
  for (const v of vocalStack) allowed.add(v.sampleName);

  const lines = code.split('\n');
  const filtered = lines.filter(line => {
    const match = line.match(/^\s*\$(\w+):/);
    if (!match) return true; // keep setcps, register, etc.
    return allowed.has(match[1]);
  });

  return filtered.join('\n');
}

async function buildEvolutionPrompt(skill: Skill, currentCode: string, provider = ''): Promise<string> {
  const memory = await buildGraphContext(skill.id, currentCode);
  return buildSystemPrompt(skill, true, provider) + memory + `

## EVOLUTION RULES
- Make EXACTLY ONE musical change per evolution.
- You may: add a new named voice, modify one existing voice, or remove one voice.
- Keep all other voices exactly as they are — copy them unchanged.
- Build up the track gradually, like a live coder adding one element at a time.`;
}

// ═══════════════════════════════════════════════════
// Conversation history
// ═══════════════════════════════════════════════════

const MAX_HISTORY_CLOUD = 20;  // keep last 20 messages (10 exchanges) for cloud models
const MAX_HISTORY_LOCAL = 4;   // keep last 4 messages (2 exchanges) for small local models

function addHistory(s: Session, role: 'user' | 'assistant', content: string): void {
  s.history.push({ role, content });
}

function getHistory(s: Session, provider = ''): ChatMessage[] {
  const maxHistory = isSmallModel(provider) ? MAX_HISTORY_LOCAL : MAX_HISTORY_CLOUD;
  // Trim oldest messages if over limit
  while (s.history.length > maxHistory) {
    s.history.shift();
  }
  return [...s.history];
}

// ═══════════════════════════════════════════════════
// Music theory context
// ═══════════════════════════════════════════════════

const HARMONY_KEYWORDS = /chord|melody|arp|harmoni|scale|key|note|pad|lead|synth|mood|jazz|minor|major|dorian|blues/i;

function buildTheoryContext(skill: Skill, text: string): string {
  if (!HARMONY_KEYWORDS.test(text)) return '';

  // Extract key from skill tags or default to C
  const keyTag = skill.tags.find(t => /^[A-G][#b]?$/i.test(t));
  const key = keyTag || 'C';

  // Detect scale from skill rules or tags
  const scaleTag = skill.tags.find(t =>
    ['minor', 'major', 'dorian', 'pentatonic', 'blues', 'mixolydian', 'phrygian', 'lydian'].includes(t.toLowerCase())
  );
  const scaleName = (scaleTag?.toLowerCase() || 'minor') as Parameters<typeof theory.generateScale>[1];

  const parts: string[] = ['## Music Theory Context'];

  try {
    const scaleNotes = theory.getScaleNotes(key, scaleName, 3);
    parts.push(`Scale: ${key} ${scaleName} → ${scaleNotes.join(' ')}`);
  } catch { /* skip if invalid key */ }

  // Add chord progressions for relevant styles
  const styleMap: Record<string, Parameters<typeof theory.generateChordProgression>[1]> = {
    jazz: 'jazz', lofi: 'jazz', 'lo-fi': 'jazz',
    house: 'edm', techno: 'edm', dnb: 'edm',
    blues: 'blues', folk: 'folk', rock: 'rock',
  };
  const skillLower = skill.id.toLowerCase();
  const progStyle = Object.entries(styleMap).find(([k]) => skillLower.includes(k))?.[1] || 'pop';

  try {
    const chords = theory.generateChordProgression(key, progStyle);
    parts.push(`Chord progression (${progStyle}): ${chords}`);
  } catch { /* skip */ }

  // If text mentions specific theory, add extras
  if (/arpeggio|arp/i.test(text)) {
    try {
      const arp = theory.generateArpeggio(`${key}m7`, 'updown');
      parts.push(`Arpeggio (${key}m7 updown): ${arp}`);
    } catch { /* skip */ }
  }

  if (/euclidean|euclid/i.test(text)) {
    parts.push(`Euclidean examples: .euclid(3,8) .euclid(5,8) .euclid(7,16) .euclid(5,16)`);
  }

  return parts.length > 1 ? '\n' + parts.join('\n') + '\n' : '';
}

// ═══════════════════════════════════════════════════
// Utils
// ═══════════════════════════════════════════════════

function cleanCode(raw: string): string {
  const stripped = raw
    .replace(/```[a-z]*\s*/g, '')
    .replace(/```\s*/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*#.*$/gm, '')
    .replace(/^REASON:.*$/gm, '')
    .replace(/^CODE:\s*$/gm, '')
    .trim();

  // Step 1: Join everything into single lines per voice (normalize LLM output)
  const lines = stripped.split('\n');
  const joined: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('$') || trimmed.startsWith('setcps')) {
      joined.push(trimmed);
    } else if (joined.length > 0) {
      const connector = trimmed.startsWith('.') ? '' : '.';
      joined[joined.length - 1] += connector + trimmed;
    } else {
      joined.push(trimmed);
    }
  }

  // Step 2: Format long voice lines into readable multi-line
  return joined.map(line => formatVoiceLine(line)).join('\n');
}

/** Split top-level .method() calls in a voice line into multiple indented lines */
function formatVoiceLine(line: string): string {
  if (!line.startsWith('$') || line.length <= 80) return line;

  // Find top-level dot positions (not inside parentheses)
  const dots: number[] = [];
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '(') depth++;
    else if (line[i] === ')') depth--;
    else if (line[i] === '.' && depth === 0 && i > 0) {
      dots.push(i);
    }
  }

  if (dots.length <= 1) return line;

  // Group into chunks of ~80 chars, splitting at top-level dots
  const parts: string[] = [];
  let start = 0;
  let currentLen = 0;

  for (let i = 0; i < dots.length; i++) {
    const end = i + 1 < dots.length ? dots[i + 1] : line.length;
    const segLen = end - dots[i];

    // Start a new line if adding this segment would exceed ~80 chars
    // (but always keep the first segment with the $name:)
    if (parts.length > 0 && currentLen + segLen > 80) {
      parts.push(line.slice(start, dots[i]));
      start = dots[i];
      currentLen = 0;
    }
    currentLen += segLen;
  }
  parts.push(line.slice(start));

  if (parts.length <= 1) return line;
  return parts[0] + '\n' + parts.slice(1).map(p => '  ' + p).join('\n');
}

function extractCps(code: string): string | null {
  const m = code.match(/setcps\(([^)]+)\)/);
  return m ? m[1] : null;
}

function cpsRange(skill: Skill): { min: string; max: string; default: string } {
  const lo = skill.tempo.min ?? 60;
  const hi = skill.tempo.max ?? 140;
  const def = skill.tempo.default ?? lo;
  return {
    min: (lo / 60 / 4).toFixed(3),
    max: (hi / 60 / 4).toFixed(3),
    default: (def / 60 / 4).toFixed(3),
  };
}

/**
 * Fix LLM output that puts BPM instead of cps.
 * Only corrects if the value is clearly wrong (> 1.0 means BPM, valid cps is ~0.2-0.6).
 * If valid, leaves it alone so the LLM can vary tempo naturally.
 */
function fixCps(code: string, skill: Skill): string {
  const m = code.match(/setcps\(([^)]+)\)/);
  if (!m) return code;
  const val = parseFloat(m[1]);
  if (isNaN(val)) return code;
  // If > 1, it's almost certainly BPM — convert it
  if (val > 1) {
    const asCps = (val / 60 / 4).toFixed(3);
    const range = cpsRange(skill);
    // Clamp to the skill's range
    const clamped = Math.max(parseFloat(range.min), Math.min(parseFloat(range.max), parseFloat(asCps))).toFixed(3);
    return code.replace(/setcps\([^)]+\)/, `setcps(${clamped})`);
  }
  return code;
}

function parseReasonCode(raw: string): { reason: string; code: string } {
  let reason = '';
  let code = raw;

  // Case-insensitive search for REASON:/CODE: markers
  const reasonIdx = raw.search(/REASON:\s*/i);
  const codeIdx = raw.search(/CODE:\s*/i);

  if (reasonIdx !== -1 && codeIdx !== -1 && reasonIdx < codeIdx) {
    const reasonStart = raw.indexOf(':', reasonIdx) + 1;
    reason = raw.substring(reasonStart, codeIdx).trim();
    const codeStart = raw.indexOf(':', codeIdx) + 1;
    code = raw.substring(codeStart).trim();
  } else if (reasonIdx !== -1) {
    const reasonStart = raw.indexOf(':', reasonIdx) + 1;
    const reasonMatch = raw.substring(reasonStart).match(/^(.+?)(?:\n|$)/);
    if (reasonMatch) {
      reason = reasonMatch[1].trim();
      code = raw.substring(reasonStart + reasonMatch[0].length).trim();
    }
  } else {
    // No markers at all — find the first line that looks like code
    const firstCodeLine = raw.search(/^\s*(\$\w+:|setcps\(|register\()/m);
    if (firstCodeLine > 0) {
      reason = raw.substring(0, firstCodeLine).trim();
      code = raw.substring(firstCodeLine).trim();
    }
  }

  // Truncate reason to one sentence for display
  if (reason.length > 200) {
    const sentenceEnd = reason.indexOf('.', 60);
    reason = sentenceEnd > 0 ? reason.substring(0, sentenceEnd + 1) : reason.substring(0, 200) + '...';
  }

  // Clean junk from reason (slashes, empty markers)
  reason = reason.replace(/^[\/\s]+$/, '').trim();

  return { reason, code: cleanCode(code) };
}

function cleanStaleVoiceRatings(s: Session, currentVoices: import('./types.js').ParsedVoice[]): void {
  const voiceNames = new Set(currentVoices.map(v => v.name));
  for (const name of s.voiceRatings.keys()) {
    if (!voiceNames.has(name)) s.voiceRatings.delete(name);
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '...' : s;
}
