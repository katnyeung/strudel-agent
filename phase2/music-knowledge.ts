/**
 * Music Knowledge — adapter layer between your agent and the music theory engine.
 *
 * This wraps the MusicTheory + PatternGenerator services adapted from
 * strudel-mcp-server by William Zujkowski (MIT License).
 * https://github.com/williamzujkowski/strudel-mcp-server
 *
 * Your agent calls these functions to get musically accurate data,
 * then feeds the results as context to the LLM for creative assembly.
 *
 * SETUP:
 *   1. Clone: git clone https://github.com/williamzujkowski/strudel-mcp-server.git /tmp/strudel-mcp
 *   2. Copy:  cp /tmp/strudel-mcp/src/services/MusicTheory.ts src/music-theory.ts
 *   3. Copy:  cp /tmp/strudel-mcp/src/services/PatternGenerator.ts src/pattern-generator.ts
 *   4. Clean: Remove Logger imports, replace with console.log
 *   5. Add MIT license header to both files
 *
 * If the files aren't present yet, all functions gracefully fall back
 * to built-in knowledge so the agent still works.
 */

// ═══════════════════════════════════════════════════
// Try to import adapted services — graceful fallback if not yet set up
// ═══════════════════════════════════════════════════

let MusicTheory: any = null;
let PatternGenerator: any = null;

try {
  MusicTheory = await import('./music-theory.js');
  console.log('[music-knowledge] MusicTheory loaded ✓');
} catch {
  console.log('[music-knowledge] MusicTheory not found — using built-in fallbacks');
}

try {
  PatternGenerator = await import('./pattern-generator.js');
  console.log('[music-knowledge] PatternGenerator loaded ✓');
} catch {
  console.log('[music-knowledge] PatternGenerator not found — using built-in fallbacks');
}

// ═══════════════════════════════════════════════════
// Public API — used by agent.ts and vibe.ts
// ═══════════════════════════════════════════════════

/**
 * Get a scale for a given root and type.
 * Returns note names like ["C", "D", "Eb", "F", "G", "Ab", "Bb"]
 */
export function getScale(root: string, scaleType: string): string[] {
  if (MusicTheory?.getScale) {
    try {
      return MusicTheory.getScale(scaleType, root);
    } catch { /* fallback */ }
  }
  return FALLBACK_SCALES[scaleType] ?? FALLBACK_SCALES['minor'];
}

/**
 * Get a chord progression for a genre and key.
 * Returns chord symbols like ["Dm7", "G7", "Cmaj7"]
 */
export function getChordProgression(genre: string, key: string): string[] {
  if (MusicTheory?.getChordProgression) {
    try {
      return MusicTheory.getChordProgression(genre, key);
    } catch { /* fallback */ }
  }
  return pickFallbackProgression(genre, key);
}

/**
 * Generate a euclidean rhythm pattern.
 * Returns a string like "x . x . x . . ." for the given hits and steps.
 * Euclidean rhythms distribute hits as evenly as possible across steps.
 */
export function euclideanRhythm(hits: number, steps: number): string {
  if (MusicTheory?.euclideanRhythm) {
    try {
      return MusicTheory.euclideanRhythm(hits, steps);
    } catch { /* fallback */ }
  }
  return computeEuclidean(hits, steps);
}

/**
 * Generate a drum pattern for a genre.
 * Returns a hint string the LLM can use as inspiration.
 */
export function getDrumPattern(genre: string): string {
  if (PatternGenerator?.generateDrumPattern) {
    try {
      return PatternGenerator.generateDrumPattern(genre);
    } catch { /* fallback */ }
  }
  return FALLBACK_DRUMS[genre] ?? FALLBACK_DRUMS['lofi'];
}

/**
 * Generate a bassline hint for a genre and key.
 */
export function getBasslineHint(genre: string, key: string): string {
  if (PatternGenerator?.generateBassline) {
    try {
      return PatternGenerator.generateBassline(genre, key);
    } catch { /* fallback */ }
  }
  return `note("${key}2 ~ ${key}2 ~").sound("triangle").lpf(400)`;
}

/**
 * Get genre characteristics — tempo range, typical scales, instruments.
 * Used by the vibe engine to understand what a genre sounds like.
 */
export function getGenreInfo(genre: string): GenreInfo {
  return GENRE_DATABASE[genre.toLowerCase()] ?? GENRE_DATABASE['lofi'];
}

/**
 * Suggest what to add next based on what's currently in the code.
 * Analyzes the current pattern and returns what's missing.
 */
export function suggestNextElement(currentCode: string, genre: string): string {
  const has = {
    kick: /\$(kick|bd)/.test(currentCode),
    snare: /\$(snare|sd|clap)/.test(currentCode),
    hat: /\$(hat|hh)/.test(currentCode),
    bass: /\$bass/.test(currentCode),
    chord: /\$(chord|keys|pad)/.test(currentCode),
    melody: /\$(melody|arp|lead)/.test(currentCode),
  };

  const info = getGenreInfo(genre);

  // Suggest based on priority order for the genre
  for (const element of info.buildOrder) {
    if (element === 'kick' && !has.kick) return 'Add a kick drum pattern';
    if (element === 'snare' && !has.snare) return 'Add snare/clap';
    if (element === 'hat' && !has.hat) return 'Add hi-hats';
    if (element === 'bass' && !has.bass) return 'Add a bass line';
    if (element === 'chord' && !has.chord) return 'Add chords or a pad';
    if (element === 'melody' && !has.melody) return 'Add a melody or arpeggio';
  }

  return 'Refine — add filter movement, variation, or effects';
}

/**
 * Build a music theory context string for the LLM prompt.
 * Gives the LLM accurate data to work with.
 */
export function buildTheoryContext(genre: string, key: string): string {
  const info = getGenreInfo(genre);
  const scale = getScale(key, info.scales[0]);
  const chords = getChordProgression(genre, key);

  return `MUSIC THEORY CONTEXT (use these for accuracy):
- Genre: ${genre} (BPM ${info.bpmRange[0]}-${info.bpmRange[1]})
- Key: ${key} ${info.scales[0]}
- Scale notes: ${scale.join(', ')}
- Suggested chords: ${chords.join(' → ')}
- Core instruments: ${info.instruments.join(', ')}
- Feel: ${info.feel}`;
}

// ═══════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════

export interface GenreInfo {
  bpmRange: [number, number];
  scales: string[];
  instruments: string[];
  feel: string;
  buildOrder: string[];
}

// ═══════════════════════════════════════════════════
// Built-in fallback data (used when MusicTheory.ts not present)
// ═══════════════════════════════════════════════════

const FALLBACK_SCALES: Record<string, string[]> = {
  'major':            ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
  'minor':            ['C', 'D', 'Eb', 'F', 'G', 'Ab', 'Bb'],
  'dorian':           ['C', 'D', 'Eb', 'F', 'G', 'A', 'Bb'],
  'phrygian':         ['C', 'Db', 'Eb', 'F', 'G', 'Ab', 'Bb'],
  'lydian':           ['C', 'D', 'E', 'F#', 'G', 'A', 'B'],
  'mixolydian':       ['C', 'D', 'E', 'F', 'G', 'A', 'Bb'],
  'minor pentatonic': ['C', 'Eb', 'F', 'G', 'Bb'],
  'major pentatonic': ['C', 'D', 'E', 'G', 'A'],
  'blues':            ['C', 'Eb', 'F', 'F#', 'G', 'Bb'],
  'whole tone':       ['C', 'D', 'E', 'F#', 'G#', 'A#'],
  'harmonic minor':   ['C', 'D', 'Eb', 'F', 'G', 'Ab', 'B'],
};

function pickFallbackProgression(genre: string, key: string): string[] {
  const g = genre.toLowerCase();
  if (g.includes('jazz'))    return [`${key}m7`, `${transposeUp(key,5)}7`, `${transposeUp(key,7)}maj7`];
  if (g.includes('soul'))    return [`${key}maj7`, `${transposeUp(key,5)}maj7`, `${transposeUp(key,3)}m7`, `${transposeUp(key,5)}7`];
  if (g.includes('blues'))   return [`${key}7`, `${transposeUp(key,5)}7`, `${key}7`];
  if (g.includes('techno'))  return [`${key}m`]; // minimal — techno doesn't need progressions
  if (g.includes('ambient')) return [`${key}`, `${transposeUp(key,7)}`]; // root + fifth, open
  // Default: minor loop (works for lofi, chill, etc.)
  return [`${key}m7`, `${transposeUp(key,3)}maj7`, `${transposeUp(key,5)}m7`, `${transposeUp(key,7)}7`];
}

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function transposeUp(note: string, semitones: number): string {
  const clean = note.replace(/[0-9]/g, '');
  const idx = NOTES.indexOf(clean);
  if (idx === -1) return note;
  return NOTES[(idx + semitones) % 12];
}

function computeEuclidean(hits: number, steps: number): string {
  if (hits >= steps) return Array(steps).fill('x').join(' ');
  if (hits <= 0) return Array(steps).fill('.').join(' ');

  // Bjorklund algorithm
  const pattern: number[] = [];
  let level = 0;
  const counts: number[] = [];
  const remainders: number[] = [];

  let divisor = steps - hits;
  remainders.push(hits);
  counts.push(divisor);

  while (remainders[level] > 1) {
    counts.push(Math.floor(divisor / remainders[level]));
    remainders.push(divisor % remainders[level]);
    divisor = remainders[level];
    level++;
  }
  counts.push(divisor);

  function build(lvl: number): void {
    if (lvl === -1) { pattern.push(0); return; }
    if (lvl === -2) { pattern.push(1); return; }
    for (let i = 0; i < counts[lvl]; i++) build(lvl - 1);
    if (remainders[lvl] !== 0) build(lvl - 2);
  }
  build(level);

  return pattern.map(p => p === 1 ? 'x' : '.').join(' ');
}

const FALLBACK_DRUMS: Record<string, string> = {
  'lofi': 'Kick on 1,7,11,15 | Snare on 5,13 | Hat *8 with degradeBy(0.2) | RolandTR808',
  'jazz': 'Ride *4 with swing(0.3) | Snare brushes on 5,13 with degradeBy(0.15) | Kick sparse',
  'techno': 'Kick four-on-floor 1,5,9,13 | Hat offbeat 3,7,11,15 | Clap on 5,13 | RolandTR909',
  'ambient': 'Barely any. Maybe hat *4 with degradeBy(0.6). Silence is the drum.',
  'soul': 'Kick on 1,7,11,15 with swing(0.2) | Snare on 5,13 | Ghost rim clicks | RolandTR808',
  'house': 'Kick four-on-floor | Clap on 5,13 | Open hat offbeat | Closed hat *16 quiet',
  'dnb': 'Fast breakbeat. Kick on 1,7,10 | Snare on 5,13,15 | Hat *16 | BPM 170+',
  'trap': 'Kick on 1,8,11 | Snare/clap on 5,13 | Hat rolls *32 with degradeBy | 808 sub bass',
};

const GENRE_DATABASE: Record<string, GenreInfo> = {
  'lofi': {
    bpmRange: [70, 85], scales: ['minor', 'dorian', 'minor pentatonic'],
    instruments: ['RolandTR808 drums', 'triangle bass', 'sawtooth keys (heavy LPF)'],
    feel: 'Lazy, warm, slightly imperfect. Tape hiss aesthetic.',
    buildOrder: ['chord', 'bass', 'kick', 'snare', 'hat', 'melody'],
  },
  'jazz': {
    bpmRange: [100, 140], scales: ['dorian', 'mixolydian', 'minor pentatonic'],
    instruments: ['ride cymbal', 'walking bass (triangle)', 'piano/comping (sawtooth LPF)', 'brush snare'],
    feel: 'Conversational, swinging, breathing. Players respond to each other.',
    buildOrder: ['bass', 'chord', 'hat', 'snare', 'melody'],
  },
  'techno': {
    bpmRange: [120, 128], scales: ['minor', 'phrygian'],
    instruments: ['RolandTR909 kick', 'offbeat hats', 'clap', 'square bass with filter LFO'],
    feel: 'Machine-like, hypnotic. Filter movement IS the melody.',
    buildOrder: ['kick', 'hat', 'snare', 'bass', 'melody'],
  },
  'ambient': {
    bpmRange: [50, 70], scales: ['minor pentatonic', 'whole tone'],
    instruments: ['supersaw pad (heavy LPF)', 'sine drone', 'sine textures', 'barely-there hats'],
    feel: 'Timeless, spacious. An environment, not a performance.',
    buildOrder: ['chord', 'melody', 'bass', 'hat'],
  },
  'soul': {
    bpmRange: [75, 95], scales: ['dorian', 'mixolydian', 'major'],
    instruments: ['sawtooth Rhodes (LPF 1200)', 'walking bass (triangle)', 'soft RolandTR808 drums'],
    feel: 'Warm groove, behind the beat. Every chord has weight.',
    buildOrder: ['chord', 'bass', 'kick', 'snare', 'hat', 'melody'],
  },
  'house': {
    bpmRange: [120, 130], scales: ['minor', 'dorian'],
    instruments: ['four-on-floor kick', 'claps', 'open hats', 'chord stabs', 'sub bass'],
    feel: 'Driving, uplifting, dancefloor energy.',
    buildOrder: ['kick', 'hat', 'snare', 'bass', 'chord', 'melody'],
  },
  'dnb': {
    bpmRange: [170, 180], scales: ['minor', 'minor pentatonic'],
    instruments: ['breakbeat drums', 'reese bass (square, heavy filter)', 'stab chords'],
    feel: 'Fast, intense, rolling breakbeats.',
    buildOrder: ['kick', 'snare', 'hat', 'bass', 'chord'],
  },
  'trap': {
    bpmRange: [130, 160], scales: ['minor', 'phrygian', 'minor pentatonic'],
    instruments: ['808 kick/sub', 'sharp snare/clap', 'rapid hi-hat rolls', 'dark pads'],
    feel: 'Hard-hitting, spacious, dramatic.',
    buildOrder: ['kick', 'snare', 'hat', 'bass', 'chord', 'melody'],
  },
  'bossa nova': {
    bpmRange: [110, 140], scales: ['major', 'dorian', 'lydian'],
    instruments: ['nylon guitar feel (sine/triangle)', 'soft kick', 'rimshot pattern', 'light bass'],
    feel: 'Gentle swing, warm, Brazilian sunshine.',
    buildOrder: ['chord', 'bass', 'hat', 'kick', 'melody'],
  },
};
