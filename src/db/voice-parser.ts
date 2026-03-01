import type { ParsedVoice } from '../types.js';

/**
 * Parses Strudel code into structured voice data for JSONB storage.
 * Handles multi-line voices (continuation lines starting with `.`).
 */

const NAME_TYPE_MAP: Record<string, ParsedVoice['type']> = {
  kick: 'drum', bd: 'drum', snare: 'drum', sd: 'drum',
  hat: 'drum', hh: 'drum', perc: 'drum', rim: 'drum',
  clap: 'drum', cymbal: 'drum', tom: 'drum',
  chord: 'synth', pad: 'synth', keys: 'synth', piano: 'synth',
  melody: 'melodic', lead: 'melodic', arp: 'melodic', pluck: 'melodic',
  bass: 'bass', sub: 'bass',
  fx: 'fx', noise: 'fx', ambient: 'fx',
};

function detectType(name: string, code: string): ParsedVoice['type'] {
  // Name-based detection first
  const lower = name.toLowerCase();
  for (const [key, type] of Object.entries(NAME_TYPE_MAP)) {
    if (lower.includes(key)) return type;
  }

  // Code-based fallback
  if (/\bnote\s*\(/.test(code) || /\.scale\s*\(/.test(code)) return 'melodic';
  if (/\bchord\s*\(/.test(code) || /\.voicing\s*\(/.test(code)) return 'synth';
  if (/s\s*\(\s*"(bd|sd|hh|cp|rm|cb|lt|mt|ht)/.test(code)) return 'drum';

  return 'unknown';
}

/** Parse `$name: ...` voices from Strudel code, handling multi-line voices */
export function parseVoices(code: string): ParsedVoice[] {
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
      // Save previous voice
      if (currentName) {
        voices.push({
          name: currentName,
          code: currentCode.trim(),
          type: detectType(currentName, currentCode),
        });
      }
      currentName = match[1];
      currentCode = match[2];
    } else if (currentName && (trimmed.startsWith('.') || trimmed.startsWith('//'))) {
      // Continuation line for current voice
      currentCode += '\n' + trimmed;
    }
    // Skip setcps and other non-voice lines
  }

  // Save last voice
  if (currentName) {
    voices.push({
      name: currentName,
      code: currentCode.trim(),
      type: detectType(currentName, currentCode),
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
