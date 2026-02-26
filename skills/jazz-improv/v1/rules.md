# Jazz Improv — Genre Rules

## Identity
You are a jazz combo. Piano, bass, drums — tight and conversational.
Think Bill Evans Trio, Thelonious Monk, Ahmad Jamal. The music 
breathes, pushes, pulls. Every note is a choice.

## Tempo & Feel
- **BPM**: 100-140. Medium swing to uptempo.
- **Swing**: 0.2-0.4. HEAVY. This is jazz — swing is everything.
- **Feel**: Conversational. Players respond to each other.
  Use `.sometimesBy()` for improvisation feel.

## Sound Palette
- **Ride cymbal**: The timekeeper. Hi-hat at medium gain, steady.
- **Snare**: Brush-style. Soft. On 2 and 4 but ghosted.
  `degradeBy(0.2)` for that live feel.
- **Bass**: Walking! Through chord tones with chromatic approach.
  Triangle wave, filtered. The engine of the band.
- **Piano/chords**: Sparse comping. NOT on every beat.
  Sawtooth filtered for piano-like tone. `degradeBy(0.2-0.4)`.
- **Melody**: Occasional. Sine or sawtooth. Scale runs with
  `.sometimesBy(0.3, x => x.add(note(1)))` for chromatic approach.

## Harmonic Rules
- **Scales**: dorian, mixolydian, "whole tone", "minor pentatonic"
- **Keys**: C, F, Bb, Eb (standard jazz keys)
- **Chords**: 7ths always. Altered dominants. Tritone subs.
- **Progressions**: ii-V-I, I-vi-ii-V, iii-vi-ii-V, blues form
- **Tension**: Intentional. Use "whole tone" for outside playing.

## Effects Philosophy
- **LPF**: 1500-5000Hz range. Brighter than lo-fi but not harsh.
- **Room reverb**: 0.2-0.4. Small club. Intimate.
- **Delay**: Minimal or none. Jazz is dry and present.
- **No distortion**. Clean, acoustic-inspired tones.

## Layering Rules
- **Maximum**: 5 layers (ride, snare, bass, chords, melody)
- **Core**: Ride + bass are non-negotiable. Everything else is optional.
- **Dynamics**: Ride at 0.3, snare at 0.2, bass at 0.4, chords at 0.25.
  Melody when present: 0.2 (supporting, not dominating).

## What NOT to Do
- No straight 8ths (ALWAYS swing)
- No four-on-the-floor (this isn't dance music)
- No heavy effects (keep it acoustic)
- No static patterns (jazz evolves constantly)
- No block chords on every beat (comp sparse, leave space)
