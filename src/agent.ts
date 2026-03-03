import type { LlmGateway } from './llm.js';
import type { Skill, BuildStep, Session, HumanInput, WsOutgoing, ChatMessage } from './types.js';
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
    voiceRatings: new Map(),
    humanQueue: [],
    history: [],
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

// ═══════════════════════════════════════════════════
// Phase 1: BOOTSTRAP — start with one simple voice
// ═══════════════════════════════════════════════════

async function bootstrap(s: Session, llm: LlmGateway): Promise<void> {
  s.phase = 'bootstrapping';
  const skill = s.skill!;

  const bpm = skill.tempo.default ?? skill.tempo.min;
  const cps = (bpm / 60 / 4).toFixed(3);

  // Generate a randomized first beat via LLM
  s.send({ type: 'thinking', phase: 'bootstrap', message: `Generating a fresh ${skill.name} beat at ${bpm} BPM...` });

  const theoryCtx = buildTheoryContext(skill, 'chord melody bass kick');

  const prompt = `Generate a fresh starting pattern for ${skill.name} at ${bpm} BPM.
Pick a random key from: C, D, Eb, F, G, Ab, Bb — don't always use the same one.
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
    const result = await llm.chat(buildSystemPrompt(skill), [{ role: 'user', content: prompt }]);
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

  const prompt = `Current code:
${s.currentCode}

Musician move: ${move}
${theoryCtx}${ratingCtx}${voiceCtx}
Apply this ONE change. You may add a new $: voice, modify an existing voice, or tweak parameters. Keep all other voices intact.

Reply in this format:
REASON: (one sentence — your musical reasoning)
CODE:
(complete updated Strudel code — setcps line + all $: voices)`;

  const codeBefore = s.currentCode;

  try {
    const messages: ChatMessage[] = [...getHistory(s), { role: 'user', content: prompt }];
    const result = await llm.chat(await buildEvolutionPrompt(s.skill!, s.currentCode), messages);
    const { reason, code } = parseReasonCode(result);

    if (code && /\$\w+:/.test(code)) {
      s.currentCode = code;
      s.lastEvolveTime = Date.now();
      s.humanEdited = false;
      addHistory(s, 'user', prompt);
      addHistory(s, 'assistant', `REASON: ${reason}\nCODE:\n${code}`);
      const voices = parseSimpleVoices(code);
      cleanStaleVoiceRatings(s, voices);
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

  const code = input.currentCode ?? s.currentCode;
  const theoryCtx = s.skill ? buildTheoryContext(s.skill, input.command) : '';

  const prompt = `Human says: "${input.command}"

Current code:
${code || '(nothing playing)'}
${theoryCtx}
Apply their request musically. You may add, modify, or remove $: voices.

Reply in this format:
REASON: (one sentence — what you changed and why)
CODE:
(complete updated Strudel code — setcps line + all $: voices)`;

  try {
    const messages: ChatMessage[] = [...getHistory(s), { role: 'user', content: prompt }];
    const result = await llm.chat(buildSystemPrompt(s.skill!), messages);
    const { reason, code: newCode } = parseReasonCode(result);

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

function buildSystemPrompt(skill: Skill, compact = false): string {
  const examples = skill.buildSequence
    .filter((s): s is BuildStep & { code: string } => !!s.code)
    .map(s => `// ${s.description}\n${s.code.trim()}`)
    .join('\n\n');

  return `You are a music copilot inside a Strudel live coding REPL.

${getBaseKnowledge(compact)}

## Genre Rules
${skill.rules}

## Example Voices
${examples}

When REASON+CODE format is requested, always include both.`;
}

async function buildEvolutionPrompt(skill: Skill, currentCode: string): Promise<string> {
  const memory = await buildGraphContext(skill.id, currentCode);
  return buildSystemPrompt(skill, true) + memory + `

## EVOLUTION RULES
- Make EXACTLY ONE musical change per evolution.
- You may: add a new named voice, modify one existing voice, or remove one voice.
- Keep all other voices exactly as they are — copy them unchanged.
- Build up the track gradually, like a live coder adding one element at a time.`;
}

// ═══════════════════════════════════════════════════
// Conversation history
// ═══════════════════════════════════════════════════

const MAX_HISTORY = 20;  // keep last 20 messages (10 exchanges)

function addHistory(s: Session, role: 'user' | 'assistant', content: string): void {
  s.history.push({ role, content });
  // Trim oldest messages if over limit
  while (s.history.length > MAX_HISTORY) {
    s.history.shift();
  }
}

function getHistory(s: Session): ChatMessage[] {
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

function parseReasonCode(raw: string): { reason: string; code: string } {
  let reason = '';
  let code = raw;

  if (raw.includes('REASON:') && raw.includes('CODE:')) {
    reason = raw.substring(raw.indexOf('REASON:') + 7, raw.indexOf('CODE:')).trim();
    code = raw.substring(raw.indexOf('CODE:') + 5).trim();
  } else if (raw.includes('REASON:')) {
    // REASON without CODE: marker — extract reason, rest is code
    const reasonMatch = raw.match(/REASON:\s*(.+)/);
    if (reasonMatch) {
      reason = reasonMatch[1].trim();
      code = raw.substring(raw.indexOf('\n', raw.indexOf('REASON:')) + 1).trim();
    }
  }

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
