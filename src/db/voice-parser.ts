/**
 * Voice Parser — extracts structured Voice data from Strudel code.
 *
 * Given a full pattern like:
 *   setcps(0.325)
 *   $kick: sound("bd:1").beat("0,4,6,10,14",16).bank("RolandTR808").gain(0.6)
 *   $bass: note("C2 ~ Eb2 ~ F2 ~").sound("triangle").lpf(350).gain(0.4)
 *
 * APIs:
 *   parseSimpleVoices(code) → ParsedVoice[]     (lightweight, used by agent/neon)
 *   voiceStateId(skillId, voices) → stable ID for VoiceState graph node
 *   voiceTypesFromNames(names) → sorted unique VoiceType[]
 */

import type { VoiceType } from './graph-types.js';
import type { ParsedVoice } from '../types.js';

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

/** Map VoiceType to ParsedVoice type for backward compat */
function toSimpleType(vt: VoiceType): ParsedVoice['type'] {
  switch (vt) {
    case 'drums': return 'drum';
    case 'bass': return 'bass';
    case 'harmony': return 'synth';
    case 'melody': return 'melodic';
    case 'texture': return 'fx';
  }
}

// ─── Note regex (used by detectKeyAndScale) ──────

const NOTE_REGEX = /[A-G][#b]?\d/g;

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

// ─── Simple parser (for agent/neon) ─────────────

/** Lightweight voice parsing — returns ParsedVoice[] for agent.ts and neon logging */
export function parseSimpleVoices(code: string): ParsedVoice[] {
  if (!code) return [];

  const lines = code.split('\n');
  const voices: ParsedVoice[] = [];
  let currentName = '';
  let currentCode = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^\$(\w+):\s*(.*)$/);
    if (match) {
      if (currentName) {
        const vt = classifyVoice(currentName);
        voices.push({
          name: currentName,
          code: currentCode.trim(),
          type: toSimpleType(vt),
        });
      }
      currentName = match[1];
      currentCode = match[2];
    } else if (currentName && (trimmed.startsWith('.') || trimmed.startsWith('//'))) {
      currentCode += '\n' + trimmed;
    }
  }

  if (currentName) {
    const vt = classifyVoice(currentName);
    voices.push({
      name: currentName,
      code: currentCode.trim(),
      type: toSimpleType(vt),
    });
  }

  return voices;
}

/** Count named voices in Strudel code */
export function countVoices(code: string): number {
  if (!code) return 0;
  return (code.match(/^\$\w+:/gm) || []).length;
}

/** Diff two sets of voices by name */
export function diffVoices(
  before: ParsedVoice[],
  after: ParsedVoice[],
): { added: string[]; removed: string[]; kept: string[] } {
  const beforeNames = new Set(before.map(v => v.name));
  const afterNames = new Set(after.map(v => v.name));

  return {
    added: [...afterNames].filter(n => !beforeNames.has(n)),
    removed: [...beforeNames].filter(n => !afterNames.has(n)),
    kept: [...afterNames].filter(n => beforeNames.has(n)),
  };
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

// ─── VoiceState helpers ──────────────────────────

/** Generate a stable VoiceState ID from skill + voice names */
export function voiceStateId(skillId: string, voices: string[]): string {
  const sorted = [...voices].sort();
  return `vs_${skillId}_${sorted.join('-')}`;
}

/** Classify voice names to sorted unique VoiceType[] */
export function voiceTypesFromNames(voiceNames: string[]): VoiceType[] {
  const types = new Set(voiceNames.map(n => classifyVoice(n)));
  return [...types].sort() as VoiceType[];
}

/** Extract voice names from Strudel code (just the $name: identifiers) */
export function extractVoiceNames(code: string): string[] {
  if (!code) return [];
  const matches = code.match(/^\$(\w+):/gm);
  if (!matches) return [];
  return matches.map(m => m.slice(1, -1)).sort();
}
