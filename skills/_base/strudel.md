# Strudel — Live Coding Music Language

## Structure
- setcps(BPM/60/4) at the top to set tempo (cycles per second).
- Each instrument is a named voice on its own line: $name: pattern
- Use descriptive names: $bass:, $kick:, $snare:, $hat:, $chord:, $pad:, $melody:, $arp:, $perc:, $rim:, $drone:

## Notes & Harmony

### Letter notes
- note("D3 F#2 C# A3").sound("supersaw") — pitch + synth.
- Sharps use #: C#, D#, F#, G#, A#. Flats use b: Db, Eb, Gb, Ab, Bb.
- Octave numbers: C2 is low bass, C3 is mid, C4 is middle C, C5 is high.

### Transposition
- .sub(12) transposes down 12 semitones (one octave).
- .add(7) transposes up 7 semitones.

### Scale degrees
- n("0 2 4 7").scale("C4:minor").sound("sawtooth") — scale degree style.
- Valid scales: major, minor, dorian, phrygian, lydian, mixolydian, locrian, "minor pentatonic", "major pentatonic", "whole tone", blues, chromatic, "harmonic minor", "melodic minor".
- IMPORTANT: Multi-word scale names use spaces, NOT underscores.

### Chords
- chord("Dm7 G7 Cmaj7 Am7").voicing() — auto-voiced chord progression.
- Chord types: m, M, 7, m7, maj7, m9, 9, dim, aug, sus2, sus4, add9.
- .voicing() spreads notes across octaves naturally.

## Drums & Samples

### Step sequencer style (recommended for drums)
- sound("bd:1").beat("0,4,8,12",16) — hit positions in a 16-step grid.
- sound("sd:2").beat("4,12",16) — snare on beats 2 and 4.
- sound("hh:2").beat("0,2,4,6,8,10,12,14",16) — eighth-note hats.
- First arg: comma-separated step positions. Second arg: total steps in the grid.

### Pattern style
- s("bd sd hh cp") — space-separated pattern in one cycle.
- s("bd:3") — specific sample number (different sample of same type).
- s("bd [~ bd] sd [~ sd]") — brackets subdivide a step.
- s("hh*8") — repeat 8 times per cycle.
- s("bd!4") — play same sound 4 times (like copy-paste).

### Drum banks
- .bank("RolandTR808") — classic 808 sounds.
- .bank("RolandTR909") — classic 909 sounds.
- Sample names: bd (bass drum), sd (snare), hh (hi-hat), cp (clap), rim (rimshot), oh (open hat).

## Synths
- .sound("supersaw") — fat detuned saw, great for bass and chords.
- .sound("sawtooth") — classic saw wave.
- .sound("square") — hollow square wave.
- .sound("triangle") — soft triangle wave, good for bass.
- .sound("sine") — pure sine wave, good for sub bass and pads.

## Timing & Rhythm
- .slow(4) — stretch pattern over 4 cycles (slower).
- .fast(2) — compress pattern into half a cycle (faster).
- .swing(0.1) — push offbeats late. 0 = straight, 0.5 = max swing.
- "<A B C D>" — angle brackets step through values, one per cycle.
- "[A B]" — square brackets subdivide into one step.

## Effects

### Filters
- .lpf(Hz) — low-pass filter. Lower = darker.
- .hpf(Hz) — high-pass filter. Higher = thinner.
- .lpf(sine.range(200,2000).slow(8)) — filter sweep with LFO.

### Space
- .room(0-1) — reverb amount. 0.3 = small room, 0.9 = cathedral.
- .delay(0-1) — delay mix. .delaytime(seconds). .delayfeedback(0-1).

### Dynamics
- .gain(0-1) — volume. 0.3 = quiet, 0.7 = loud.
- .pan(0-1) — stereo position. 0 = left, 0.5 = center, 1 = right.

### Randomness & Variation
- .degradeBy(0.3) — randomly drop 30% of notes.
- .sometimesBy(0.5, x => x.fast(2)) — 50% chance to apply effect.
- rand — random 0-1 each cycle. rand.range(0.2, 0.8) — random in range.
- sine.range(lo,hi).slow(N) — smooth LFO oscillation.
- .every(4, x => x.fast(2)) — apply effect every N cycles.
- .jux(rev) — play reversed version in opposite stereo channel.

## Output Rules
- First line: setcps(N) to set tempo.
- Each subsequent line: one named voice ($name: pattern).
- No stack(), no variables, no comments in output code, no semicolons.
- All parentheses must be matched.
- Keep it minimal — start simple, build up.
