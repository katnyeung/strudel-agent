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
$chord: chord("<Cm7 Fm7 Abmaj7 G7>").voicing().sound("sawtooth").lpf(1200).gain(0.3)
$bass: note("<C2 ~ C2 ~ Eb2 ~ F2 ~ | C2 ~ Eb2 ~ G2 ~ F2 ~>").sound("triangle").lpf(350).gain(0.4)
$kick: sound("bd:1").beat("0,4,8,12", 16).gain(0.6)
$hat: sound("hh").beat("0,2,4,6,8,10,12,14", 16).gain(rand.range(0.1, 0.25))
```

Techniques to avoid the reset feeling:
- Use <> angle brackets with different numbers of alternatives per voice
- Add .degradeBy() to create randomness that masks loop boundaries
- Use rand.range() on gain/pan so each cycle sounds slightly different
- Use .every(N, fn) to apply changes at different intervals per voice
- Use .sometimesBy() for probabilistic variation

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
- "@" duration weight: "0@2 4@3" — event 0 lasts 2 units, event 4 lasts 3 units.

### Drum banks
- .bank("RolandTR808") — classic 808 sounds. Good for: lo-fi, soul, hip-hop.
- .bank("RolandTR909") — classic 909 sounds. Good for: techno, house, trance.
- Sample names: bd (bass drum), sd (snare), hh (hi-hat), cp (clap), rim (rimshot), oh (open hat).

## Synths
- .sound("supersaw") — fat detuned saw, great for bass, chords, trance leads.
- .sound("sawtooth") — classic saw wave. Good for filtered bass, pads.
- .sound("square") — hollow square wave. Good for retro, chip sounds.
- .sound("triangle") — soft triangle wave, good for bass and mellow tones.
- .sound("sine") — pure sine wave, good for sub bass, pads, FM source.
- .sound("pulse") — pulse wave. Use with .dec() and .fm() for percussive tones.
- .sound("white") — white noise. Use with .seg() and .dec() for noise hats/percussion.

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
- .shape(0-1) — waveshaping. Subtle saturation. Good for adding warmth.
- .crush(bits) — bit crusher. 16 = clean, 8 = digital grit, 4 = extreme.
- .coarse(N) — sample rate reduction. Higher = more aliasing.

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
- rand — random 0-1 each cycle. rand.range(0.2, 0.8) — random in range.
- irand(N) — random integer 0 to N-1.
- perlin — smooth Perlin noise (0-1). perlin.range(lo,hi).slow(N) — smooth random drift.
- sine.range(lo,hi).slow(N) — smooth sine LFO oscillation.
- cosine, tri, saw — other LFO shapes. All have .range() and .slow().
- .every(N, fn) — apply function every N cycles.
- .jux(rev) — play reversed version in opposite stereo channel.
- .juxBy(amount, fn) — jux with stereo spread control (0-1).
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
15. Mixed per orbit

## Output Rules
- First line: setcps(N) to set tempo.
- Each subsequent line: one named voice ($name: pattern).
- No stack(), no variables, no comments in output code, no semicolons.
- All parentheses must be matched.
- All drum voices use .beat() with the SAME step count (16).
- All melodic/bass patterns use the same number of events or angle brackets.
- Bass patterns: 4 or 8 events per cycle, NO .slow(). One bar per cycle.
- Chord patterns: use <> angle brackets for one chord per cycle. Use .slow(N) ONLY if exactly N chords.
- STAGGER loop lengths: chords cycle over 4 bars, bass varies over 2 bars, add .degradeBy() and rand for variety.
- register() custom functions go at the very top, before setcps().
- Keep it minimal — start simple, build up.

## Community Resources
These are known high-quality sources for learning advanced Strudel techniques:
- Switch Angel (github.com/switchangel/strudel-scripts) — custom functions, trance/techno patterns, prebake scripts.
- Strudel.cc /learn/effects/ — official docs on filters, envelopes, FM, all effects.
- Strudel.cc /recipes/ — cookbook of common patterns and techniques.
- awesome-strudel (github.com/terryds/awesome-strudel) — curated community patterns.
- Strudel FAQ (doc.patternclub.org) — community-maintained Q&A with advanced tips.