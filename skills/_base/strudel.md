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

### Break samples
- s("breaks165") — classic breakbeat sample. Other breaks: breaks125, breaks152, breaks157.
- .fit() — time-stretch the sample to fit one cycle regardless of its original tempo.
- .slice(N, "pattern") — chop sample into N slices, play them in the order given.
  Example: s("breaks165").fit().slice(8, "0 0 6 3 0 2 6 7") — 8 slices, custom order.
- .chop(N) — chop into N equal pieces and play them in sequence. Good for granular textures.

## Synths
- .sound("supersaw") — fat detuned saw, great for bass and chords.
- .sound("sawtooth") — classic saw wave.
- .sound("square") — hollow square wave.
- .sound("triangle") — soft triangle wave, good for bass.
- .sound("sine") — pure sine wave, good for sub bass and pads.

## Envelope (ADSR)
- .attack(seconds) — fade-in time. 0.01 = snappy, 0.5 = slow swell, 2 = ambient rise.
- .decay(seconds) — time to fall from peak to sustain level.
- .sustain(0-1) — volume level while note is held. 0 = pluck, 1 = organ.
- .release(seconds) — fade-out after note ends. 0.1 = tight, 1 = lingering tail.
- Default is near-instant attack/release. Use ADSR on pads, basses, and melodic voices — not drums.
- Example: note("C3").sound("sine").attack(0.02).decay(0.3).sustain(0.5).release(0.8)

## Timing & Rhythm
- .slow(4) — stretch pattern over 4 cycles (slower).
- .fast(2) — compress pattern into half a cycle (faster).
- .swing(0.1) — push offbeats late. 0 = straight, 0.5 = max swing.
- "<A B C D>" — angle brackets step through values, one per cycle.
- "[A B]" — square brackets subdivide into one step.

## Effects

### Filters
- .lpf(Hz) — low-pass filter. Lower = darker. Alias: .cutoff(Hz).
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
- .sometimes(fn) — shorthand for .sometimesBy(0.5, fn).
- .rarely(fn) — shorthand for .sometimesBy(0.1, fn).
- rand — random 0-1 each cycle. rand.range(0.2, 0.8) — random in range.
- perlin — smooth Perlin noise 0-1. perlin.range(lo, hi) — smooth random in range. Smoother than rand.
- sine.range(lo,hi).slow(N) — smooth LFO oscillation.
- choose([a, b, c]) — pick one value randomly from the list each cycle.
- .every(4, x => x.fast(2)) — apply effect every N cycles.
- .jux(rev) — play reversed version in opposite stereo channel.

### Pattern manipulation
- .rev — reverse the pattern.
- .palindrome — play forward then backward.
- .iter(N) — shift pattern left by 1 step each cycle, over N cycles.
- .speed(N) — playback speed. -1 = reverse. 0.5 = half speed.

### Euclidean rhythms
- .euclid(pulses, steps) — distribute pulses evenly across steps.
  Example: s("bd").euclid(5, 8) — 5 hits spread across 8 steps (Afro-Cuban clave feel).
  Common patterns: (3,8) = tresillo, (5,8) = clave, (7,16) = complex African rhythm.

### Conditional / probability
- "bd?" — 50% chance this event plays. Shorthand for degradeBy on a single event.

## Visual Feedback
Visual methods render live visualizations in the browser. Use them to make the music visual.

### Coloring notes
- .color("cyan") — color all events from this voice. Good for distinguishing voices.
- .color("cyan magenta") — alternate colors per event.
- Colors: any CSS color name or hex. Good picks: cyan, magenta, orange, lime, salmon, gold, orchid, tomato, steelblue.

### Pianoroll (melodic voices)
- ._pianoroll() — inline scrolling pianoroll, great for note/chord/melody/arp voices. PREFERRED.
- ._pianoroll({ labels: 1 }) — show note labels on each bar.
- ._pianoroll({ cycles: 8, playhead: 0.5 }) — show 8 cycles, playhead in middle.
- ._pianoroll({ active: "cyan", inactive: "#333" }) — custom colors.

### Scope (audio waveform)
- ._scope() — inline oscilloscope showing the waveform of this voice. PREFERRED.
- ._scope({ samples: 256 }) — more detail.

### Spiral
- ._spiral() — inline rotating spiral visualization. PREFERRED.
- ._spiral({ steady: 1/4 }) — spiral rotates with playhead.

### Spectrum analyzer
- ._spectrum() — inline frequency spectrum bars. PREFERRED.

### Usage tips
- Add .color() to EVERY voice for visual distinction — it's lightweight.
- Add ._pianoroll() to ONE melodic voice (chord, melody, arp, bass) — not drums.
- Add ._scope() or ._spectrum() sparingly — one at a time, on a voice with interesting timbre.
- ALWAYS use the inline versions (with _ prefix) — they render inside the code editor next to each voice.
- These go at the END of the method chain, after all sound/effect methods.

## Output Rules
- First line: setcps(N) to set tempo.
- Each subsequent line: one named voice starting with $name:
- Long method chains can wrap to the next line with 2-space indent:
    $chord: chord("Bbm7 Ebm7 Fm7 Bbm7").voicing().slow(4).sound("triangle")
      .lpf(sine.range(400,1200).slow(6)).gain(0.32).room(0.55)
      .color("magenta")._pianoroll()
- No stack(), no variables, no comments in output code, no semicolons.
- All parentheses must be matched.
- Keep it minimal — start simple, build up.
