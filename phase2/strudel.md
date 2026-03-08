# Strudel — Live Coding Music Language

## Structure
- setcps(BPM/60/4) at the top to set tempo (cycles per second).
- Each instrument is a named voice on its own line: $name: pattern
- Use descriptive names: $bass:, $kick:, $snare:, $hat:, $chord:, $pad:, $melody:, $arp:, $perc:, $rim:, $drone:

## ⚠️ CRITICAL — Rhythm Alignment Rules

These rules prevent beats from sliding out of time. Follow them strictly.

### The Golden Rule: One cycle = one bar
In Strudel, one cycle = one musical bar. ALL voices share the same cycle.
If your tempo is setcps(78/60/4), then one cycle = one bar of 78 BPM in 4/4 time.
Every voice pattern plays within that same cycle, simultaneously.

### Rule 1: All drums MUST use the same grid
Use .beat() with the SAME step count for ALL drum voices in a pattern.
16 steps is the standard. NEVER mix different step counts between drum voices.

```
// ✅ CORRECT — all drums on the same 16-step grid
$kick: sound("bd:1").beat("0,6,10,14", 16).gain(0.6)
$snare: sound("sd:2").beat("4,12", 16).gain(0.45)
$hat: sound("hh").beat("0,2,4,6,8,10,12,14", 16).gain(0.2)
$rim: sound("rim").beat("2,6,10,14", 16).gain(0.15)

// ❌ WRONG — different step counts = beats slide
$kick: sound("bd:1").beat("0,3,6", 12).gain(0.6)
$snare: sound("sd:2").beat("4,12", 16).gain(0.45)
```

### Rule 2: Bass notes MUST align to the same grid
Write bass patterns so they have exactly 4 or 8 events per cycle (matching 4 beats).
Use rests (~) to fill gaps. Do NOT use .slow() on bass.

```
// ✅ CORRECT — 8 events = 8 sixteenth-note slots = one bar
$bass: note("C2 ~ C2 ~ Eb2 ~ F2 ~").sound("triangle").lpf(350).gain(0.4)

// ✅ CORRECT — 4 events = 4 beats = one bar
$bass: note("C2 ~ Eb2 ~").sound("triangle").lpf(350).gain(0.4)

// ❌ WRONG — .slow(2) makes bass take 2 bars while drums take 1
$bass: note("C2 ~ C2 ~ Eb2 ~ F2 ~").sound("triangle").slow(2).lpf(350).gain(0.4)
```

### Rule 3: Chords use .slow(N) ONLY with exactly N chord events
If you use .slow(4), the pattern MUST have exactly 4 chord events.
Each event plays for exactly one bar.

```
// ✅ CORRECT — 4 chords + .slow(4) = one chord per bar for 4 bars
$chord: chord("<Cm7 Fm7 Abmaj7 G7>").voicing().sound("sawtooth").slow(4).lpf(1200).gain(0.3)

// ✅ ALSO CORRECT — angle brackets step one per cycle, no .slow() needed
$chord: chord("<Cm7 Fm7 Abmaj7 G7>").voicing().sound("sawtooth").lpf(1200).gain(0.3)

// ❌ WRONG — 3 chords + .slow(4) = chords drift against 4/4 drums
$chord: chord("<Cm7 Fm7 G7>").voicing().sound("sawtooth").slow(4).lpf(1200).gain(0.3)
```

### Rule 4: Angle brackets <> are your friend for multi-bar patterns
Use <> to step through values one per cycle. This naturally aligns to bars.
Combine with slow() only when the count matches.

```
// One chord per bar, cycles through 4 bars:
$chord: chord("<Cm7 Fm7 Abmaj7 G7>").voicing().sound("sawtooth").lpf(1200).gain(0.3)

// One bass note per bar:
$bass: note("<C2 F2 Ab2 G2>").sound("triangle").lpf(350).gain(0.4)
```

### Rule 5: Never use .slow() or .fast() on drum voices
Drums must stay grid-locked. Tempo changes come from setcps(), not from
.slow() or .fast() on individual drum voices.

```
// ❌ WRONG — .fast(2) on drums = drums at double tempo, everything else normal
$kick: s("bd*4").fast(2).gain(0.8)

// ✅ CORRECT — change setcps() instead if you want faster tempo
setcps(140/60/4)
$kick: sound("bd").beat("0,4,8,12", 16).gain(0.8)
```

### Quick Reference: Events Per Cycle

| Pattern | Events | Duration each |
|---------|--------|--------------|
| "bd" | 1 | whole bar |
| "bd sd" | 2 | half bar (half notes) |
| "bd sd bd sd" | 4 | quarter bar (quarter notes) |
| "bd ~ sd ~ bd ~ sd ~" | 8 | eighth notes |
| .beat("0,4,8,12", 16) | 4 hits in 16 slots | sixteenth-note grid |
| "hh*16" | 16 | sixteenth notes |

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
- Use angle brackets to step one chord per cycle: chord("<Dm7 G7 Cmaj7 Am7>")

## Drums & Samples

### .beat() step sequencer (PREFERRED for all drum patterns)
This is the most reliable way to write drum patterns. Positions are 0-indexed
in a grid of N steps. All drum voices MUST use the same N value.

```
// 16-step grid (standard — use this)
$kick: sound("bd:1").beat("0,4,8,12", 16).gain(0.6)           // four-on-the-floor
$snare: sound("sd:2").beat("4,12", 16).gain(0.45)              // backbeat on 2 and 4
$hat: sound("hh").beat("0,2,4,6,8,10,12,14", 16).gain(0.2)    // eighth-note hats
$oh: sound("oh").beat("2,10", 16).gain(0.25)                   // offbeat open hats
$rim: sound("rim").beat("4,10,14", 16).gain(0.15)              // syncopated rim

// Common 16-step positions:
// Beat 1: 0    Beat 2: 4    Beat 3: 8    Beat 4: 12
// &-of-1: 2    &-of-2: 6    &-of-3: 10   &-of-4: 14
// e-of-1: 1    e-of-2: 5    e-of-3: 9    e-of-4: 13
// a-of-1: 3    a-of-2: 7    a-of-3: 11   a-of-4: 15
```

### .beat() with variation
```
// Change hits every other bar using angle brackets:
$kick: sound("bd:1").beat("<0,4,8,12 0,4,6,10,14>", 16).gain(0.6)
$hat: sound("hh").beat("0,2,4,6,8,10,12,14", 16).gain(rand.range(0.1, 0.25))
```

### Mini-notation (use for melodic patterns, ambience, or experimental)
- s("bd sd hh cp") — space-separated pattern in one cycle.
- s("bd:3") — specific sample number.
- s("bd [~ bd] sd [~ sd]") — brackets subdivide a step.
- s("hh*8") — repeat 8 times per cycle.
- s("bd!4") — play same sound 4 times.
- "~" is a rest (silence).

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
- .slow(N) — stretch pattern over N cycles. ONLY use on chords/pads with exactly N events.
- .fast(N) — compress into 1/N cycle. AVOID on drums.
- .swing(0.1) — push offbeats late. 0 = straight, 0.5 = max swing.
  Apply swing to INDIVIDUAL voices, not globally. Use same swing value on all drum voices.
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

## Euclidean Rhythms
- .euclid(hits, steps) — distribute hits evenly across steps.
- s("bd").euclid(3, 8) — 3 hits over 8 steps = classic tresillo.
- s("bd").euclid(5, 8) — 5 hits over 8 steps = common Afro-Cuban.
- Great for percussion that should feel organic but stay rhythmic.
- Common useful patterns: (3,8), (5,8), (7,16), (5,16), (3,16).

## Output Rules
- First line: setcps(N) to set tempo.
- Each subsequent line: one named voice ($name: pattern).
- No stack(), no variables, no comments in output code, no semicolons.
- All parentheses must be matched.
- All drum voices use .beat() with the SAME step count (16).
- All melodic/bass patterns use the same number of events or angle brackets.
- Keep it minimal — start simple, build up.
