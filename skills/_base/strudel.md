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
$kick: sound("bd:1").beat("0,4,8,12", 16).gain(0.6)
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

### Rule 2b: Melody/arp notes MUST use power-of-2 event counts
Melody and arp patterns must have exactly 1, 2, 4, 8, or 16 events per cycle.
These are the only counts that align to a 16-step drum grid.
Use rests (~) to fill slots and create rhythm. Do NOT use odd counts like 3, 5, 6, 7, 9.

```
// ✅ CORRECT — 8 events (notes + rests) = aligned to 16-step grid
$melody: note("C4 ~ E4 ~ G4 ~ E4 ~").sound("sawtooth").lpf(1500).gain(0.3)

// ✅ CORRECT — 4 events = one note per beat
$melody: note("C4 E4 G4 C5").sound("sawtooth").lpf(1500).gain(0.3)

// ❌ WRONG — 9 events = each note is 1/9 of a cycle, drifts against 16-step drums
$melody: note("C4 D4 E4 F4 G4 A4 B4 C5 G4").sound("sawtooth").lpf(1500).gain(0.3)

// ❌ WRONG — 5 events = each note is 1/5 of a cycle, misaligned
$melody: note("C4 E4 G4 B4 C5").sound("sawtooth").lpf(1500).gain(0.3)
```

If you have more notes than fit in a power-of-2, either:
- Use angle brackets to spread across bars: note("<C4 E4 G4 C5> <E4 G4 B4 E5>")
- Use 16 events with rests: note("C4 ~ E4 ~ G4 ~ B4 ~ C5 ~ B4 ~ G4 ~ E4 ~")

### Rule 3: Chords use .slow(N) ONLY with exactly N chord events
If you use .slow(4), the pattern MUST have exactly 4 chord events.
Each event plays for exactly one bar.

```
// ✅ CORRECT — 4 chords + .slow(4) = one chord per bar for 4 bars
$chord: chord("<Cm7 Fm7 Am7 G7>").voicing().sound("sawtooth").slow(4).lpf(1200).gain(0.3)

// ✅ ALSO CORRECT — angle brackets step one per cycle, no .slow() needed
$chord: chord("<Cm7 Fm7 Am7 G7>").voicing().sound("sawtooth").lpf(1200).gain(0.3)

// ❌ WRONG — 3 chords + .slow(4) = chords drift against 4/4 drums
$chord: chord("<Cm7 Fm7 G7>").voicing().sound("sawtooth").slow(4).lpf(1200).gain(0.3)
```

### Rule 4: Angle brackets <> are your friend for multi-bar patterns
Use <> to step through values one per cycle. This naturally aligns to bars.
Combine with slow() only when the count matches.

```
// One chord per bar, cycles through 4 bars:
$chord: chord("<Cm7 Fm7 Am7 G7>").voicing().sound("sawtooth").lpf(1200).gain(0.3)

// One bass note per bar:
$bass: note("<C2 F2 G#2 G2>").sound("triangle").lpf(350).gain(0.4)
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

### Rule 6: Stagger loop lengths to prevent the "reset" feeling
When ALL voices loop back to beat 1 at the same moment, it sounds like the
music "resets" — jarring and mechanical. Prevent this by giving voices
different cycle lengths using angle brackets <>.

```
// ❌ BAD — everything loops every 1 cycle, reset is obvious
$chord: chord("Cm7").voicing().sound("sawtooth").lpf(1200).gain(0.3)
$bass: note("C2 ~ C2 ~").sound("triangle").lpf(350).gain(0.4)
$kick: sound("bd:1").beat("0,4,8,12", 16).gain(0.6)

// ✅ GOOD — chords cycle every 4 bars, bass varies every 2 bars, drums constant
$chord: chord("<Cm7 Fm7 Am7 G7>").voicing().sound("sawtooth").lpf(1200).gain(0.3)
$bass: note("<C2 ~ C2 ~ Eb2 ~ F2 ~ C2 ~ Eb2 ~ G2 ~ F2 ~>").sound("triangle").lpf(350).gain(0.4)
$kick: sound("bd:1").beat("0,4,8,12", 16).gain(0.6)
$hat: sound("hh").beat("0,2,4,6,8,10,12,14", 16).gain(perlin.range(0.1, 0.25))
```

Techniques to avoid the reset feeling:
- Use <> angle brackets with different numbers of alternatives per voice
- Add .degradeBy() to create randomness that masks loop boundaries
- Use perlin.range() on gain/pan so each cycle sounds slightly different (smooth noise, no NaN at cycle boundaries)
- Use .every(N, fn) to apply changes at different intervals per voice
- Use .sometimesBy() for probabilistic variation

### Rule 7: Wrap-around gap must not be the shortest gap
When a .beat() pattern loops from the last hit back to step 0, the distance
(called the wrap-around gap) must NOT be shorter than all other gaps in the pattern.
If it is, the loop reset feels like a dropped beat — the downbeat arrives too early.

```
// Count the gaps between consecutive hits (including last-to-first):
// "0,6,10,14" in 16 steps: gaps = 6, 4, 4, 2(wrap)
//   wrap=2 is SHORTEST → BAD, feels like lost half-beat at loop point

// "0,6,10,12" in 16 steps: gaps = 6, 4, 2, 4(wrap)
//   wrap=4 is NOT shortest (2 is) → OK, loop resets smoothly

// "0,4,8,12" in 16 steps: gaps = 4, 4, 4, 4(wrap)
//   all equal → PERFECT, metronomic
```

Rule of thumb: the wrap-around gap should be >= the average gap in the pattern.
One voice with a tight wrap is a subtle feel thing. Multiple voices with bad
wrap-arounds will compound and the whole groove loses its anchor.

### Rule 8: Step N in an N-step grid = step 0 (DOUBLE HIT BUG)
In .beat(positions, N), valid positions are 0 through N-1.
Step N wraps to step 0 because the grid is modular. If you include BOTH
step 0 and step N, the downbeat fires TWICE — an audible double-hit or flam.

```
// ❌ WRONG — step 16 = step 0, so kick fires twice on the downbeat
$kick: sound("bd:1").beat("0,4,8,11,16", 16)
// Strudel sees this as: "0,4,8,11,0" → TWO hits at position 0

// ❌ ALSO WRONG — same problem
$hat: sound("hh").beat("0,4,8,12,16", 16)
// Equivalent to "0,0,4,8,12" → double hit at step 0

// ✅ CORRECT — positions stay within 0 to 15
$kick: sound("bd:1").beat("0,4,8,11", 16)
$kick: sound("bd:1").beat("0,4,8,14", 16)
```

This applies to ANY grid size: in .beat(pos, 8), valid positions are 0-7.
Step 8 = step 0. In .beat(pos, 32), valid positions are 0-31. Step 32 = step 0.

NEVER use position N in an N-step grid. Maximum position is always N-1.

### Rule 9: Mask loop boundaries with randomness
Strict repetition exposes the loop point. Even with good gap math, a perfectly
identical kick pattern every cycle makes the reset audible. Use randomness to
blur the boundary so each cycle sounds slightly different.

Techniques:
- **Gain variation**: `.gain(perlin.range(0.45, 0.65))` — smooth noise so each hit
  has slightly different volume. Use perlin (not rand) to avoid NaN at cycle boundaries.
- **Ghost kicks**: Add a second quiet kick voice on off-positions with
  `.degradeBy(0.5)` so it only appears half the time, filling gaps organically.
- **degradeBy on non-essential hits**: `.degradeBy(0.1)` on the main pattern
  occasionally drops a hit, breaking the mechanical loop feel.
- **Filter variation**: `.lpf(perlin.range(800, 2000))` — timbral changes per hit.

```
// ✅ Main kick with gain variation (perlin = smooth noise, no AudioParam errors)
$kick: sound("bd:2").beat("0,4,8,11", 16).bank("RolandTR808").gain(perlin.range(0.45, 0.65)).lpf(sine.range(800, 2500).slow(8)).swing(0.2)

// ✅ Ghost kicks filling the biggest gaps — quiet, probabilistic
$kickghost: sound("bd:2").beat("2,9,14", 16).bank("RolandTR808").gain(perlin.range(0.15, 0.25)).degradeBy(0.5).lpf(800).swing(0.2)
```

Ghost kick placement: put ghost hits in the MIDDLE of the widest gaps in
the main pattern. For "0,4,8,11" (gaps: 4,4,3,5), the widest gap is
11→0 (5 steps), so step 14 is the best ghost position.
Combine with gain randomness on the main kick for maximum loop-point masking.

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
- .add("-14,-21") transposes to multiple intervals at once (creates harmony).
- n("0".add(-14)).scale("g:minor") — transpose by scale degrees.

### Scale degrees
- n("0 2 4 7").scale("C4:minor").sound("sawtooth") — scale degree style.
- Valid scales: major, minor, dorian, phrygian, lydian, mixolydian, locrian, "minor pentatonic", "major pentatonic", "whole tone", blues, chromatic, "harmonic minor", "melodic minor".
- IMPORTANT: Multi-word scale names use spaces, NOT underscores.

### Chords
- chord("Dm7 G7 Cmaj7 Am7").voicing() — auto-voiced chord progression.
- Chord types: m, M, 7, m7, maj7, m9, 9, dim, aug, sus2, sus4, add9.
- .voicing() spreads notes across octaves naturally.
- Use angle brackets to step one chord per cycle: chord("<Dm7 G7 Cmaj7 Am7>")
- .dict('ireal') — use iReal Pro voicing dictionary for jazz chords.
- **CRITICAL: .voicing() chord roots — MUST be uppercase natural notes:**
  **C, D, E, F, G, A, B** — these ALWAYS work with .voicing().
  Root letter MUST be UPPERCASE. `chord("cm")` is INVALID — use `chord("Cm")`.
  All sharps and flats (C#, Db, D#, Eb, F#, Gb, G#, Ab, A#, Bb) are UNRELIABLE and may produce "[voicing]: unknown chord" errors.
  - ❌ BROKEN: cm, fm, am, D#maj7, A#maj7, G#maj7, Abmaj7, Ebmaj7, Bbmaj7, Fmaj7, C#m7, F#m7
  - ✅ SAFE: Cm, Cm7, Dm7, Em7, Fm7, Gm7, Am7, Bm7, Cmaj7, Gmaj7
  - ALWAYS pick a key whose chords use only natural roots: C minor, D minor, F minor, G minor, A minor
  - Example progressions:
    - C minor: chord("<Cm7 Fm7 G7 Cm7>")
    - F minor: chord("<Fm7 Cm7 G7 Am7>")
    - A minor: chord("<Am7 Dm7 G7 Cmaj7>") — classic ii-V-I
    - D minor: chord("<Dm7 Gm7 Am7 Dm7>")
  - NEVER use accidentals (sharps/flats) as chord roots with .voicing(). Transpose to a natural-root key instead.

## Drums & Samples

### ⚠️ Sample naming — COLON for variants, never slash-as-path
Sample variants use COLON notation: `"sd:2"`, `"bd:3"`, `"hh:1"`.
The number after the colon selects a specific sample from that group.

```
// ✅ CORRECT — colon selects sample variant
sound("sd:2")    // snare, variant 2
sound("bd:3")    // bass drum, variant 3
sound("hh:1")    // hi-hat, variant 1

// ❌ WRONG — slash with a non-number is NOT valid sample selection
sound("jazz/sd")   // INVALID — "jazz" is not a sample, "sd" is not a number
sound("808/kick")  // INVALID — use .bank("RolandTR808") instead
sound("drums/hh")  // INVALID — no folder-path syntax exists
```

To change the drum CHARACTER (e.g. 808 vs 909), use .bank():
```
sound("sd:2").bank("RolandTR808")   // 808-style snare
sound("sd:2").bank("RolandTR909")   // 909-style snare
```

There is no way to combine folder-style paths with sample names.
Always use `sound("sampleName:variant").bank("bankName")`.

**NEVER** combine bank name + sound name into one string:
```
// ❌ INVALID — these sample names do not exist
sound("RolandTR909_triangle")  // WRONG
sound("RolandTR808_bd")        // WRONG
sound("RolandTR909_sd")        // WRONG

// ✅ CORRECT — bank is always a separate method
sound("triangle")                         // synth oscillator
sound("bd:1").bank("RolandTR909")         // drum with bank
```

**Valid sound names (exhaustive list):**
- Drums: `bd`, `sd`, `hh`, `cp`, `oh`, `rim` (with optional `:N` variant)
- Synths: `sawtooth`, `triangle`, `sine`, `square`, `supersaw`
- Noise: `white`
- Do NOT invent other sample names — only these exist.

**NOTE**: Slash with a NUMBER (e.g. `"amen/4"`) is valid mini-notation —
it divides the sample into N equal time slots in the cycle. This is a
**timing/subdivision** operator, NOT a path separator:
```
s("amen/4").fit()    // ✅ divide amen into 4 equal time parts (valid mini-notation)
s("breaks/2").fit()  // ✅ divide breaks into 2 equal time parts
sound("jazz/sd")     // ❌ "sd" is not a number — this is NOT subdivision, it's just wrong
```

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
$hat: sound("hh").beat("0,2,4,6,8,10,12,14", 16).gain(perlin.range(0.1, 0.25))
```

### Mini-notation (use for melodic patterns, ambience, or experimental)
- s("bd sd hh cp") — space-separated pattern in one cycle.
- s("bd:3") — specific sample number.
- s("bd [~ bd] sd [~ sd]") — brackets subdivide a step.
- s("hh*8") — repeat 8 times per cycle.
- s("bd!4") — play same sound 4 times.
- "~" is a rest (silence).
- "@" duration weight: "0@2 4@3" — event 0 lasts 2 units, event 4 lasts 3 units.

### Drum banks
- .bank("RolandTR808") — classic 808 sounds. Good for: lo-fi, soul, hip-hop.
- .bank("RolandTR909") — classic 909 sounds. Good for: techno, house, trance.
- Sample names: bd (bass drum), sd (snare), hh (hi-hat), cp (clap), rim (rimshot), oh (open hat).

### Sample Manipulation
These functions control how samples are played back — essential for breakbeats,
loops, and DJ-style effects.

- .fit() — makes sample fit its event duration by adjusting playback speed.
  Essential for drum breaks and loops. Without it, long samples spill over.
- .loopAt(N) — speed up/slow down sample to loop perfectly in N cycles.
- .begin(0-1) — start playback from this position in the sample. 0 = start, 0.5 = middle.
- .end(0-1) — stop playback at this position.
- .chop(N) — slice sample into N equal pieces, played in order. Great for granular effects.
- .slice(N, "pattern") — slice into N pieces, play them in the order specified by pattern.
- .splice(N, "pattern") — like slice but adjusts speed to fit event duration.
- .cut(N) — cut group: when a new sound in group N starts, the previous one stops.
  Use .cut(1) to prevent sample overlap.
- .speed(N) — playback speed. 1 = normal, 2 = double speed/octave up, -1 = reverse.
- .rev() — reverse the sample.

```
// Chopped breakbeat
$break: s("amen/4").fit().chop(16).cut(1).sometimesBy(0.5, ply("2")).gain(0.5)

// Sliced break with custom order
$break: s("amen/4").fit().slice(8, "<0 1 2 3 4*2 5 6 [6 7]>*2").cut(1).gain(0.5)

// Sample start offset for texture variation
$hat: s("hh*8").begin(rand.range(0, 0.5)).gain(0.2)
```

### Scrubbing (DJ-style sample scratching)
- .scrub(position) — scrub through a sample like a tape loop or turntable.
  Position (0-1) represents location in the audio file. Pattern it for movement.
  Optional "position:speed" syntax where second value controls playback speed.

```
// DJ scratch effect — scrub through positions
$scratch: s("breaks/2").fit().scrub("{0.1!2 .25@3 0.7!2 <0.8:1.5>}%8").gain(0.4)

// Random scrub positions quantized to 16 steps
$glitch: s("breaks/2").fit().scrub(irand(16).div(16).seg(8)).gain(0.35)
```

## Synths
- .sound("supersaw") — fat detuned saw, great for bass, chords, trance leads.
- .sound("sawtooth") — classic saw wave. Good for filtered bass, pads.
- .sound("square") — hollow square wave. Good for retro, chip sounds.
- .sound("triangle") — soft triangle wave, good for bass and mellow tones.
- .sound("sine") — pure sine wave, good for sub bass, pads, FM source.
- .sound("pulse") — pulse wave. Use with .dec() and .fm() for percussive tones.
- .sound("white") — white noise. Use with .seg() and .dec() for noise hats/percussion.

## Sample-Based Instruments
- `sound("piano")` — acoustic piano from dirt-samples. Warm, natural attack and decay. Best for lo-fi, jazz, café vibes.
- `sound("gm_epiano1")` — General MIDI electric piano. Rhodes-like, warmer than acoustic.
- `sound("gm_epiano2")` — another electric piano variant.
- ⚠️ `sawtooth` through LPF does NOT sound like piano — it sounds like a pipe organ. Use `sound("piano")` for piano parts.
- ⚠️ Don't apply heavy LPF (<1500Hz) to piano samples — kills natural brightness. Keep LPF > 2000Hz or skip it.

## Timing & Rhythm
- .slow(N) — stretch pattern over N cycles. ONLY use on chords/pads with exactly N events.
- .fast(N) — compress into 1/N cycle. AVOID on drums.
- .swing(0.1) — push offbeats late. 0 = straight, 0.5 = max swing.
  Apply swing to INDIVIDUAL voices, not globally. Use same swing value on all drum voices.
- "<A B C D>" — angle brackets step through values, one per cycle.
- "[A B]" — square brackets subdivide into one step.
- "{A B C}%N" — curly braces play A B C spread over N steps per cycle.
- .struct("x ~ x ~ x ~ ~ x") — impose a rhythmic structure (x = on, ~ = off).

### Pattern Segmentation
- .seg(N) — quantize a continuous signal or pattern into N discrete steps per cycle.
  Essential for making LFOs/signals work with synths: s("supersaw").seg(16).lpf(tri.range(100,5000))
  Without .seg(), filter LFOs only update once per note onset.
- .ply(N) — repeat each event N times within its own time span.

## Effects

### Filters
- .lpf(Hz) — low-pass filter. Lower = darker. Range 0-20000.
- .hpf(Hz) — high-pass filter. Higher = thinner. Range 0-20000.
- .bpf(Hz) — band-pass filter. Center frequency.
- .lpf(sine.range(200,2000).slow(8)) — filter sweep with LFO.
- .lpq(N) — filter resonance (Q factor). 0 = gentle, 10+ = aggressive, 30+ = self-oscillating.
- .hpq(N) — high-pass resonance.
- .ftype("ladder") — filter type. "12db" (0) = gentle, "ladder" (1) = aggressive, "24db" (2) = steep.

### Filter Envelopes (KEY technique for expressive sounds)
Each note triggers a filter envelope that sweeps the cutoff dynamically.
This is how you get punchy bass, plucky leads, and evolving pads.

- .lpenv(depth) — filter envelope modulation depth. Controls how far the filter opens on each note.
  Positive values = filter opens UP on attack (brighter). Negative = opens DOWN (darker).
  Range: -8 to 8. Higher = more dramatic sweep.
- .lpa(time) — filter envelope attack time in seconds. How fast filter opens.
- .lpd(time) — filter envelope decay time. How fast filter closes after attack.
- .lps(level) — filter envelope sustain level (0-1). Where filter stays while note is held.
- .lpr(time) — filter envelope release time. How fast filter closes after note ends.

```
// Punchy acid bass — filter snaps open on each note then closes
$bass: note("c2 c2 eb2 c2").sound("sawtooth").lpf(300).lpenv(4).lpq(8).lpd(0.2).gain(0.5)

// Plucky filtered lead
$lead: n("0 2 4 7").scale("C4:minor").sound("sawtooth").lpf(400).lpa(0.01).lpd(0.15).lpenv(3).gain(0.3)

// Slow evolving pad — filter opens gradually
$pad: note("C4 E4 G4").sound("supersaw").slow(8).lpf(300).lpa(0.5).lpenv(4).gain(0.25)

// Negative envelope — gets darker on each note
$dark: note("c2 e2 f2 g2").sound("sawtooth").lpf(2000).lpenv(-3).gain(0.4)
```

Also works for high-pass and band-pass: .hpenv(), .hpa(), .hpd(), .hps(), .hpr(), .bpenv(), etc.

### Amplitude Envelope (ADSR)
Controls the volume shape of each note.

- .attack(time) or .att(time) — fade in time in seconds.
- .decay(time) or .dec(time) — time to fall from peak to sustain level.
- .sustain(level) or .sus(level) — volume level while note is held (0-1).
- .release(time) or .rel(time) — fade out time after note ends.
- .adsr("attack:decay:sustain:release") — all in one.
- .clip(duration) — clip note length (0-1 of event length). Useful for staccato.

```
// Short plucky sound
$pluck: note("c3 e3 g3 c4").sound("sawtooth").decay(0.2).sustain(0).lpf(2000).gain(0.3)

// Long sustaining pad
$pad: note("C4 E4 G4").sound("sine").attack(1).release(2).slow(8).gain(0.2)
```

### FM Synthesis
- .fm(depth) — frequency modulation depth. Higher = more harmonics/distortion.
- .fmh(ratio) — FM harmonicity ratio. Integer ratios = harmonic, non-integer = inharmonic/metallic.
- .fmenv(depth) — FM envelope depth. Makes FM amount change over note duration.
- .fmattack(time), .fmdecay(time), .fmrelease(time) — FM envelope timing.

```
// Metallic percussion
$perc: s("pulse!16").dec(0.1).fm(4).fmh(3).gain(0.2)

// Evolving FM texture
$fm: note("c3 e3 g3").sound("sine").fm(sine.range(0,4).slow(8)).fmh(2).gain(0.25)
```

### Pitch Envelope
- .penv(depth) — pitch envelope depth in semitones. Positive = pitch starts high then drops.
- .pdec(time) — pitch envelope decay time.

```
// Zap/laser sound
$zap: sound("sine").penv(48).pdec(0.05).note("c3").gain(0.3)

// Pitch-dropping kick
$kick: sound("sine").penv(24).pdec(0.1).note("c1").gain(0.6)
```

### Space
- .room(0-1) — reverb send amount. 0.3 = small room, 0.9 = cathedral.
- .roomsize(0-10) — reverb room size. Larger = longer tail.
- .delay(0-1) — delay send amount.
- .delaytime(seconds) — delay time.
- .delayfeedback(0-1) — delay repeats. Higher = more echoes.
- .delaysync(N) — sync delay time to N cycles.

### Audio Routing with Orbits
Orbits route voices to separate effect buses. Each orbit has its own reverb and delay.
This prevents one voice's reverb from overwriting another's.

- .orbit(N) — route to effect bus N (0-7). Default is 1.
- Use different orbits when voices need different reverb/delay settings.

```
// Dry kick on orbit 1, wet pad on orbit 2
$kick: sound("bd").beat("0,4,8,12", 16).orbit(1).room(0).gain(0.7)
$pad: note("C4 E4 G4").sound("supersaw").slow(8).orbit(2).room(0.9).roomsize(8).gain(0.2)
```

⚠️ Two voices on the same orbit will share reverb/delay — the last one to set .room() wins.
Always put voices with different reverb needs on different orbits.

### Distortion & Saturation
- .distort("amount:mix") — distortion. e.g. .distort("4:.2") = heavy distortion, 20% mix.
- .distort("amount:mix:type") — specify distortion type. Types: diode, fold, chebyshev, scurve,
  asym, sinefold, soft, hard, cubic.
- .diode("amount:mix") — diode clipping distortion. Warm, tube-like overdrive.
  e.g. .diode("3:.3") = moderate diode distortion at 30% mix.
- .fold("amount:mix") — wavefolding distortion. Creates complex harmonics.
- .shape(0-1) — waveshaping. Subtle saturation. Good for adding warmth.
- .crush(bits) — bit crusher. 16 = clean, 8 = digital grit, 4 = extreme.
- .coarse(N) — sample rate reduction. Higher = more aliasing.

```
// Warm diode saturation on bass
$bass: note("c2 c2 eb2 c2").sound("sawtooth").lpf(400).diode("2:.6").gain(0.4)

// Wavefolded texture
$texture: note("c3 e3 g3").sound("sine").fold("4:.3").slow(4).gain(0.25)

// Breakbeat with gritty distortion
$break: s("amen/4").fit().chop(16).distort("2:0.5").gain(0.4)
```

### Sidechain Ducking (pump effect)
Sidechain ducking modulates the volume of one orbit based on another voice's hits.
This is the classic EDM "pumping" effect where the bass/pad ducks when the kick hits.

- .duckorbit(N) — target orbit N for ducking. The current voice's hits trigger the duck.
- .duckorbit("N:M") — target multiple orbits at once.
- .duckdepth(0-1) — how much the target volume drops. 1 = full duck, 0.5 = half.
- .duckattack(time) — how fast the volume drops (in seconds). Shorter = snappier pump.
- .duckrelease(time) — how fast the volume comes back up. Longer = more obvious pump.

```
// Classic sidechain pump: kick ducks the pad
$kick: sound("bd:4").beat("0,4,8,12", 16).duckorbit(2).duckattack(0.01).duckdepth(0.8).duckrelease(0.3).gain(0.7)
$pad: note("C4 E4 G4").sound("supersaw").slow(8).orbit(2).lpf(1200).gain(0.35)

// Kick ducks multiple orbits (bass + pad)
$kick: sound("bd:4").beat("0,4,8,12", 16).duckorbit("2:3").duckdepth(1).duckattack(0.01).gain(0.7)
$bass: note("C2").sound("sawtooth").orbit(2).lpf(400).gain(0.4)
$pad: note("C4 E4 G4").sound("supersaw").slow(8).orbit(3).gain(0.3)
```

⚠️ The ducked voices MUST be on the target orbit (set with .orbit(N)).
The ducking voice triggers the effect; the target orbit's volume pumps.

### Dynamics
- .gain(0-1) — volume. 0.3 = quiet, 0.7 = loud.
- .pan(0-1) — stereo position. 0 = left, 0.5 = center, 1 = right.
- .postgain(N) — gain applied after all effects (at orbit level).

### Modulation Effects
- .phaser(N) — phaser effect, N = speed in cycles.
- .vibrato(speed) — pitch vibrato.
- .leslie(speed) — Leslie speaker effect (rotary).
- .tremolo(speed) — amplitude tremolo. Use with .tremolodepth(), .tremoloskew(), .tremoloshape().

### Randomness & Variation
- .degradeBy(0.3) — randomly drop 30% of notes.
- .sometimesBy(0.5, x => x.fast(2)) — 50% chance to apply effect.
- .rarely(fn) — ~10% chance. .sometimes(fn) — ~50% chance. .often(fn) — ~75% chance.
- .almostNever(fn) — even sparser than .rarely(). ~5-10% probability. Great for rare glitches.
  Example: .almostNever(ply("<2 4>")) — very occasionally double or quadruple a hit.
- rand — random 0-1 each cycle. rand.range(0.2, 0.8) — random in range. ⚠️ Do NOT use rand.range() on AudioParam values (gain, lpf, pan) — can produce NaN at cycle boundaries. Use perlin.range() for audio params instead.
- irand(N) — random integer 0 to N-1.
- perlin — smooth Perlin noise (0-1). perlin.range(lo,hi).slow(N) — smooth random drift.
- sine.range(lo,hi).slow(N) — smooth sine LFO oscillation.
- cosine, tri, saw — other LFO shapes. All have .range() and .slow().
- .every(N, fn) — apply function every N cycles.
- .jux(rev) — play reversed version in opposite stereo channel.
- .juxBy(amount, fn) — jux with stereo spread control (0-1).
- .rib(seed, length) — rhythmic pattern transformation. Creates variations from a seed value.
  Used internally by trancegate and other rhythm generators.
- .mask("<0 0 1 1 1 1 1 1>/N") — mute/unmute pattern over N cycles. Good for arrangement builds.

### Fill & Sustain
- .fill(value) — fill gaps between events with sustained sound. Makes notes ring into each other.
- .legato(N) — set note duration as fraction of event. >1 = overlapping, <1 = staccato.

## Interactive Controls
- slider(value, min, max, step) — creates a draggable slider widget INSIDE the code.
  Returns a pattern value. Adjust parameters in real time by dragging.

```
// Filter controlled by slider
$lead: note("c3 e3 g3").sound("sawtooth").lpf(slider(1000, 100, 5000, 10)).gain(0.3)

// Filter envelope depth controlled by slider
$bass: note("c2").sound("sawtooth").lpf(300).lpenv(slider(4, 0, 8, 0.1)).lpq(8).gain(0.5)
```

## Custom Functions with register()
Strudel can be extended by registering custom pattern methods.
These are powerful shortcuts used by advanced live coders.

```
// Shorthand for orbit routing
register('o', (orbit, pat) => pat.orbit(orbit))
// Usage: .o(2) instead of .orbit(2)

// Relative low-pass filter (0-1 maps to full frequency range exponentially)
register('rlpf', (x, pat) => { return pat.lpf(pure(x).mul(12).pow(4)) })
// Usage: .rlpf(0.5) — halfway through frequency range

// Relative high-pass filter
register('rhpf', (x, pat) => { return pat.hpf(pure(x).mul(12).pow(4)) })

// Trance gate — rhythmic chopping of sustained sounds
register('trancegate', (density, seed, length, x) => {
  return x.struct(
    rand.mul(density).round().seg(16).rib(seed, length)
  ).fill(0.8).clip(0.8)
})
// Usage: .trancegate(1.5, 45, 1) — creates rhythmic on/off gating
```

Note: Custom register() functions must be defined at the top of the code, before any $: voices.
The agent should include these in the code output when using them.

## Euclidean Rhythms
- .euclid(hits, steps) — distribute hits evenly across steps.
- s("bd").euclid(3, 8) — 3 hits over 8 steps = classic tresillo.
- s("bd").euclid(5, 8) — 5 hits over 8 steps = common Afro-Cuban.
- Great for percussion that should feel organic but stay rhythmic.
- Common useful patterns: (3,8), (5,8), (7,16), (5,16), (3,16).

## Visual Feedback
Visual methods render live visualizations in the browser. Use them to make the music visual.

### Coloring notes
- .color("cyan") — color all events from this voice. Good for distinguishing voices.
- .color("cyan magenta") — alternate colors per event.
- Colors: any CSS color name or hex. Good picks: cyan, magenta, orange, lime, salmon, gold, orchid, tomato, steelblue.

### Pianoroll (melodic voices)
- .pianoroll() — scrolling pianoroll, great for note/chord/melody/arp voices.
- .pianoroll({ labels: 1 }) — show note labels on each bar.
- .pianoroll({ cycles: 8, playhead: 0.5 }) — show 8 cycles, playhead in middle.
- .pianoroll({ active: "cyan", inactive: "#333" }) — custom colors.
- ._pianoroll() — inline (renders inside the code editor, not background).

### Scope (audio waveform)
- .scope() — oscilloscope showing the waveform of this voice.
- .scope({ samples: 256 }) — more detail.
- ._scope() — inline version.

### Spiral
- .spiral() — rotating spiral visualization.
- .spiral({ steady: 1/4 }) — spiral rotates with playhead.
- ._spiral() — inline version.

### Spectrum analyzer
- .spectrum() — frequency spectrum bars.
- ._spectrum() — inline version.

### Punchcard
- .punchcard() — grid view showing event timing and transformations.
- ._punchcard() — inline version.

### Usage tips
- Add .color() to EVERY voice for visual distinction — it's lightweight.
- Add .pianoroll() to ONE melodic voice (chord, melody, arp, bass) — not drums.
- Add .scope() or .spectrum() sparingly — one at a time, on a voice with interesting timbre.
- Background versions (no underscore) render on the page canvas. Inline versions (_ prefix) render in the editor.
- These go at the END of the method chain, after all sound/effect methods.

## Advanced Trance / EDM Techniques

### Supersaw leads with gating
The classic trance sound: supersaw chord through a trance gate and filtered.

```
$lead: n("<3@3 4 5@3 6>*2".add("-14,-21")).scale("g:minor")
  .sound("supersaw").seg(16).lpf(slider(1500, 100, 5000)).lpenv(2).orbit(2).gain(0.4)
```

### Layered detuned chords
Use .add() with multiple intervals to create instant harmony from a single scale degree.

```
$chord: n("0".add("-14,-21")).scale("g:minor").sound("supersaw")
  .lpf(1200).lpenv(2).room(0.4).gain(0.35)
```

### Noise percussion
White noise shaped into hi-hats and percussion.

```
$noisehat: s("white").seg(16).dec(0.05).hpf(8000).gain(0.15)
```

### Pulse percussion with FM
Pulse wave with FM modulation for metallic/percussive textures.

```
$pulse: s("pulse!16").dec(0.1).fm(4).fmh(3).orbit(4).gain(0.2)
```

### Build-up / breakdown with mask
Use .mask() to bring voices in and out over multiple bars.

```
$hat: sound("hh").beat("0,2,4,6,8,10,12,14", 16).mask("<0 0 1 1 1 1 1 1>/8").gain(0.2)
$pad: note("C4 E4 G4").sound("supersaw").slow(8).mask("<0@4 1@12>/16").gain(0.25)
```

## Signal Chain Order
Effects are applied in this order (knowing this helps avoid surprises):
1. Sound generation (sample or oscillator)
2. Gain + amplitude ADSR
3. Low-pass filter (lpf)
4. High-pass filter (hpf)
5. Band-pass filter (bpf)
6. Vowel filter
7. Bit crush / coarse
8. Distortion / shape
9. Tremolo
10. Compressor
11. Pan
12. Phaser
13. Post-gain
14. Split to: dry out, delay send, reverb send
15. Mixed per orbit (duck affects orbit-level volume here)

## Output Rules
- First line: setcps(N) to set tempo.
- Each subsequent line: one named voice ($name: pattern).
- No stack(), no variables, no comments in output code, no semicolons.
- NEVER use the pipe character `|` inside patterns. `|` is NOT valid Strudel mini-notation. Use spaces to separate events within angle brackets: `note("<C2 ~ E2 ~ G2 ~ F2 ~>")` NOT `note("<C2 ~ E2 ~ | G2 ~ F2 ~>")`.
- All parentheses must be matched.
- All drum voices use .beat() with the SAME step count (16).
- .beat() positions must be 0 to N-1. NEVER use position N (e.g. step 16 in a 16-step grid = step 0, causes double-hit).
- Avoid placing a kick hit on step 12 when you also hit step 0 — the 12→0 gap (4 steps) combined with cycle-boundary scheduling can cause audible double-triggers. Prefer step 14 for the last syncopated kick: e.g. `"0,4,6,10,14"` not `"0,4,6,10,12"`.
- All melodic/bass patterns use the same number of events or angle brackets.
- Bass patterns: 4 or 8 events per cycle, NO .slow(). One bar per cycle.
- Chord patterns: use <> angle brackets for one chord per cycle. Use .slow(N) ONLY if exactly N chords.
- STAGGER loop lengths: chords cycle over 4 bars, bass varies over 2 bars, add .degradeBy() and rand for variety.
- Use .gain(perlin.range()) on drum voices to mask loop boundaries — strict repetition exposes the reset point. NEVER use rand.range() on AudioParam values (gain, lpf, pan) — it produces NaN at cycle boundaries causing double-triggers. Use perlin.range() instead (smooth noise, always finite).
- register() custom functions go at the very top, before setcps().
- Voice muting: prefix with _$ instead of $ to mute a voice without deleting it.
  _$kick: sound("bd").beat("0,4,8,12", 16) — this voice is muted but preserved.
- Sample variants use COLON (e.g. "sd:2"). Slash with a string (e.g. "jazz/sd") is INVALID. Slash with a number (e.g. "amen/4") is valid mini-notation subdivision.
- .color() is VISUAL ONLY — it colors events in the browser visualizer but produces no audio effect.
  It is optional and goes at the END of the chain. Do not confuse it with an audio function.
- Keep it minimal — start simple, build up.

## Community Resources
These are known high-quality sources for learning advanced Strudel techniques:
- Switch Angel (github.com/switchangel/strudel-scripts) — custom functions, trance/techno patterns, prebake scripts.
- Strudel.cc /learn/effects/ — official docs on filters, envelopes, FM, all effects.
- Strudel.cc /recipes/ — cookbook of common patterns and techniques.
- awesome-strudel (github.com/terryds/awesome-strudel) — curated community patterns.
- Strudel FAQ (doc.patternclub.org) — community-maintained Q&A with advanced tips.