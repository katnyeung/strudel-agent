/**
 * Voice Parser — extracts structured Voice data from Strudel code.
 *
 * Given a full pattern like:
 *   setcps(0.325)
 *   $kick: sound("bd:1").beat("0,4,6,10,14",16).bank("RolandTR808").gain(0.6)
 *   $bass: note("C2 ~ Eb2 ~ F2 ~").sound("triangle").lpf(350).gain(0.4)
 *
 * Produces Voice objects with name, type, notes, synth, effects, etc.
 */

import type { VoiceNode, VoiceType } from './graph-types.js';

// ─── Voice type classification ────────────────────

const DRUM_NAMES = new Set([
  'kick', 'bd', 'snare', 'sd', 'hat', 'hh', 'clap', 'cp',
  'rim', 'perc', 'oh', 'break', 'ghost', 'fill', 'dust',
]);

const BASS_NAMES = new Set(['bass', 'sub', 'drone']);
const HARMONY_NAMES = new Set(['chord', 'keys', 'pad', 'rhodes']);
const MELODY_NAMES = new Set(['melody', 'arp', 'lead']);

function classifyVoice(name: string): VoiceType {
  const lower = name.toLowerCase();
  if (DRUM_NAMES.has(lower)) return 'drums';
  if (BASS_NAMES.has(lower)) return 'bass';
  if (HARMONY_NAMES.has(lower)) return 'harmony';
  if (MELODY_NAMES.has(lower)) return 'melody';
  return 'texture';
}

// ─── Extract note values ──────────────────────────

const NOTE_REGEX = /[A-G][#b]?\d/g;

function extractNotes(code: string): string[] {
  // Pull notes from note("...") or chord("...") or n("...").scale("...")
  const noteMatch = code.match(/(?:note|chord)\s*\(\s*"([^"]+)"\s*\)/);
  if (noteMatch) {
    const notes = noteMatch[1].match(NOTE_REGEX) ?? [];
    // Deduplicate
    return [...new Set(notes)];
  }
  return [];
}

// ─── Extract synth/sample name ────────────────────

function extractSynth(code: string): string {
  // .sound("sawtooth") or .s("bd*4") or sound("bd:1")
  const soundMatch = code.match(/\.?(?:sound|s)\s*\(\s*"([^"*:!\[\]]+)/);
  if (soundMatch) return soundMatch[1].trim();
  return 'unknown';
}

// ─── Extract gain value ───────────────────────────

function extractGain(code: string): number {
  const gainMatch = code.match(/\.gain\s*\(\s*([\d.]+)\s*\)/);
  if (gainMatch) return parseFloat(gainMatch[1]);
  return 0.5; // default
}

// ─── Extract BPM from setcps ──────────────────────

export function extractBpm(code: string): number {
  const cpsMatch = code.match(/setcps\s*\(\s*([\d.]+)\s*\)/);
  if (cpsMatch) {
    const cps = parseFloat(cpsMatch[1]);
    return Math.round(cps * 60 * 4); // reverse of BPM/60/4
  }
  return 0;
}

// ─── Detect key and scale ─────────────────────────

export function detectKeyAndScale(code: string): { key: string | null; scale: string | null } {
  // From .scale("C4:minor") or .scale("Eb3:dorian")
  const scaleMatch = code.match(/\.scale\s*\(\s*"([A-G][#b]?)\d*:([^"]+)"\s*\)/);
  if (scaleMatch) {
    return { key: scaleMatch[1], scale: scaleMatch[2] };
  }

  // From chord("Dm7 G7 Cmaj7") — detect root of first chord
  const chordMatch = code.match(/chord\s*\(\s*"<?([A-G][#b]?)/);
  if (chordMatch) {
    return { key: chordMatch[1], scale: null };
  }

  // From note("C2 Eb2 F2") — detect most common root
  const allNotes = code.match(NOTE_REGEX);
  if (allNotes && allNotes.length > 0) {
    const roots = allNotes.map(n => n.replace(/\d+$/, ''));
    const freq = new Map<string, number>();
    for (const r of roots) freq.set(r, (freq.get(r) ?? 0) + 1);
    const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
    return { key: sorted[0][0], scale: null };
  }

  return { key: null, scale: null };
}

// ─── Main parser ──────────────────────────────────

export function parseVoices(patternId: string, code: string): VoiceNode[] {
  const voices: VoiceNode[] = [];

  // Match lines like: $kick: sound("bd:1").beat("0,4,8,12",16)...
  const voiceRegex = /^\$(\w+):\s*(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = voiceRegex.exec(code)) !== null) {
    const name = match[1];
    const voiceCode = match[2].trim();

    voices.push({
      id: `${patternId}_${name}`,
      name,
      code: voiceCode,
      type: classifyVoice(name),
      synth: extractSynth(voiceCode),
      notes: extractNotes(voiceCode),
      has_lpf: /\.(?:lpf|cutoff)\s*\(/.test(voiceCode),
      has_room: /\.room\s*\(/.test(voiceCode),
      has_delay: /\.delay\s*\(/.test(voiceCode),
      has_swing: /\.swing\s*\(/.test(voiceCode),
      gain: extractGain(voiceCode),
    });
  }

  return voices;
}

// ─── Classify a move type from reason text ────────

export function classifyMoveType(reason: string): string {
  const lower = reason.toLowerCase();

  if (/add.*voice|new.*\$|introduce|added a new/.test(lower)) return 'add_voice';
  if (/remove|drop|strip|take out/.test(lower)) return 'remove_voice';
  if (/filter|lpf|hpf|cutoff|sweep/.test(lower)) return 'modify_filter';
  if (/chord|voicing|harmony|progression/.test(lower)) return 'change_chord';
  if (/note|melody|pitch|transpose|scale/.test(lower)) return 'change_melody';
  if (/rhythm|beat|pattern|syncopat/.test(lower)) return 'change_rhythm';
  if (/swing|groove|feel/.test(lower)) return 'change_groove';
  if (/gain|volume|dynamic|quiet|loud/.test(lower)) return 'change_dynamics';
  if (/reverb|room|delay|space/.test(lower)) return 'add_effect';
  if (/pan|stereo|jux/.test(lower)) return 'change_stereo';
  if (/degrade|random|sometimes|vary/.test(lower)) return 'add_variation';
  if (/slow|fast|tempo|speed/.test(lower)) return 'change_tempo';

  return 'other';
}

export function classifyMoveCategory(moveType: string): 'bold' | 'subtle' {
  const bold = new Set([
    'add_voice', 'remove_voice', 'change_chord',
    'change_melody', 'change_tempo',
  ]);
  return bold.has(moveType) ? 'bold' : 'subtle';
}
