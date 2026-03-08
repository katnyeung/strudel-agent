# Music Composition — Fundamentals for Live Coding

## ⚠️ Rhythm Alignment — The #1 Rule

Before anything else: **all voices must share the same rhythmic grid**.
Beats sliding out of time is the most common problem. These rules prevent it.

### One cycle = one bar
In Strudel, one cycle = one musical bar. ALL voices share the same cycle length.
`setcps(78/60/4)` means one cycle = one bar at 78 BPM in 4/4 time.

### All drums on the same .beat() grid
Use `.beat(positions, 16)` for ALL drum voices. Never mix grid sizes.
16 steps is the standard grid. Position 0 = beat 1, position 4 = beat 2, etc.

```
// ✅ CORRECT — all drums on the same 16-step grid
$kick: sound("bd:1").beat("0,6,10,14", 16).gain(0.6)
$snare: sound("sd:2").beat("4,12", 16).gain(0.45)
$hat: sound("hh").beat("0,2,4,6,8,10,12,14", 16).gain(0.2)

// ❌ WRONG — mixed notation = timing drift
$kick: s("bd ~ ~ bd ~ ~ bd ~").gain(0.6)
$snare: sound("sd:2").beat("4,12", 16).gain(0.45)
```

### Bass aligns to the cycle, no .slow()
Write bass with 4 or 8 events per cycle. Use rests (~) for gaps. Never use .slow() on bass.

```
// ✅ CORRECT — 8 events = one bar of sixteenth notes
$bass: note("C2 ~ C2 ~ Eb2 ~ F2 ~").sound("triangle").lpf(350).gain(0.4)

// ❌ WRONG — .slow(2) makes bass take 2 bars while drums take 1 = drift
$bass: note("C2 ~ C2 ~ Eb2 ~ F2 ~").sound("triangle").slow(2).gain(0.4)
```

### Chords use angle brackets for bar-by-bar stepping
`<>` steps through one value per cycle, naturally aligning to bars.

```
// ✅ CORRECT — one chord per bar, perfectly aligned
$chord: chord("<Cm7 Fm7 G#maj7 G7>").voicing().sound("sawtooth").lpf(1200).gain(0.3)

// ❌ WRONG — 3 chords + .slow(4) = chords drift against 4/4 drums
$chord: chord("<Cm7 Fm7 G7>").voicing().sound("sawtooth").slow(4).gain(0.3)
```

### Same swing on all voices
If using swing, apply the SAME `.swing()` value to every voice that needs it.
Mismatched swing values between voices = flamming and drift.

### 16-Step Grid Quick Reference

```
Position:  0  1  2  3  4  5  6  7  8  9  10 11 12 13 14 15
Beat:      1  e  &  a  2  e  &  a  3  e  &  a  4  e  &  a

Four on the floor:  0,4,8,12          (kick every beat)
Backbeat:           4,12              (snare on 2 and 4)
Offbeat:            2,6,10,14         (& of each beat)
Eighth notes:       0,2,4,6,8,10,12,14
Tresillo:           0,3,6,10          (Latin clave base)
```

---

## Rhythm

### What is rhythm?
Rhythm is the pattern of sounds and silences in time. It's the skeleton of music — without it, notes are just a wash of sound.

### Pulse and BPM
- The **pulse** (beat) is the steady heartbeat. Listeners tap their foot to it.
- BPM (beats per minute) sets the energy: 60-80 = chill/ambient, 80-100 = hip-hop/soul, 100-130 = house/techno, 130-170 = drum & bass/jungle.
- In Strudel, setcps(BPM/60/4) converts BPM to cycles per second.

### Subdivision
- A beat can be divided: halves (eighth notes), quarters (sixteenth notes), thirds (triplets).
- In a 16-step grid: positions 0,4,8,12 = quarter notes. Even positions = eighth notes. All 16 = sixteenth notes.
- Mixing subdivisions creates interest — kick on quarters (0,4,8,12) with hats on eighths (0,2,4,6,8,10,12,14).

### The kick-snare relationship
- **Kick** provides the low-end pulse. Where the kick hits defines the groove's character.
- **Snare/clap** is the backbeat — on beats 2 and 4 (steps 4 and 12 in a 16-step grid).
- Four-on-the-floor: kick on 0,4,8,12. Foundation of house/techno.
- Breakbeat: kick on 0,6,10 or 0,5,10,14. Syncopated. Foundation of hip-hop.
- Half-time: kick on 0, snare on 12 (or 8). DnB, trip hop.

### Swing and groove
- **Straight** timing = robotic, precise. Good for techno.
- **Swing** pushes offbeat notes late, creating a human feel. Essential for jazz, soul, lo-fi.
- .swing(0.1) = subtle warmth. .swing(0.2) = lo-fi groove. .swing(0.3) = heavy jazz swing.
- CRITICAL: Apply the same .swing() value to ALL voices. Mismatched swing = flamming.
- Ghost notes (very quiet hits) add pocket and feel. Use low .gain() values (0.05-0.15).

### Syncopation
- Notes that land BETWEEN the main beats. Creates tension and movement.
- Example: kick on step 6 instead of 8 — pushes the groove forward.
- In 16-step grid, odd positions (1,3,5,7,9,11,13,15) are syncopated positions.
- Too much syncopation = chaotic. Balance syncopated elements with steady ones (backbeat on 4,12).

### Space and silence
- What you DON'T play is as important as what you play.
- .degradeBy() creates musical space by randomly dropping notes.
- Fewer beat positions = more space. Compare kick on "0,4,8,12" (dense) vs "0,10" (spacious).
- Silence before a drop makes the drop hit harder.

---

## Harmony

### Notes and intervals
- An **interval** is the distance between two notes. Small intervals (semitone, tone) = tension. Large intervals (fifth, octave) = stability.
- **Consonant** intervals sound stable: octave, fifth, fourth, major/minor third.
- **Dissonant** intervals create tension: minor second, tritone. Use them intentionally.

### Scales and keys
- A **scale** is a set of notes that sound good together. Stay in one scale for coherence.
- **Minor** scales = sad, moody, introspective. Best for lo-fi, ambient, deep house.
- **Major** scales = bright, uplifting. Good for soul, pop.
- **Dorian** = minor but with a brighter 6th. Jazz, neo-soul, chill.
- **Pentatonic** = 5-note scale, almost impossible to sound bad. Safe choice.
- **Phrygian** = dark, Spanish/Middle Eastern flavor. Good for dark techno.

### Chord progressions
- A **chord** is 3+ notes played together. Chords create the emotional landscape.
- **7th chords** (Dm7, Cmaj7) add sophistication. Essential for jazz, soul, lo-fi.
- **9th/11th/13th** chords add even more color. Use sparingly.
- Common progressions:
  - ii-V-I (Dm7 → G7 → Cmaj7) — the jazz standard.
  - I-vi-IV-V (C → Am → F → G) — pop/soul.
  - i-iv-v (Cm → Fm → Gm) — minor loop, lo-fi/ambient.
  - i-VI-III-VII (Cm → Ab → Eb → Bb) — lo-fi/neo-soul classic loop.
- **Slow chord movement**: change chords every 2-4 bars for ambient/lo-fi. Every bar for jazz.
- Always use angle brackets `<>` to step through chords one per cycle (one per bar).

### Chord probability — what real songs do
Based on analysis of thousands of popular songs, here's what chords typically follow each other:

- After **I**: IV (22%), V (19%), vi (15%), ii (8%). The I→IV→V→I cycle is the backbone of pop.
- After **IV**: I (32%), V (29%), vi (10%). The IV chord almost always resolves to I or V.
- After **V**: I (44%), vi (14%), IV (11%). The V→I resolution is the strongest pull in music.
- After **vi**: IV (26%), V (18%), ii (12%), I (11%). Minor chords love moving to IV.
- After **ii**: V (48%), IV (14%), I (10%). The ii→V is by far the most common two-chord motion.

Follow high-probability paths for "safe" progressions. Pick low-probability paths for unexpected movement.

### Bass and root movement
- The **bass note** anchors the harmony. Usually plays the root of the chord.
- Walking bass: moves stepwise through chord tones. Keeps energy flowing.
- Pedal bass: stays on one note while chords change above. Creates tension.
- Bass patterns use 4 or 8 events per cycle. No .slow() on bass lines.

---

## Arrangement & Dynamics

### Building a track
- Start minimal — one or two voices. Let listeners settle in.
- Add elements one at a time. Each new voice should add something the track is missing.
- Order of importance varies by genre:
  - Techno: kick → bass → hats → clap → synth stab
  - House: kick → hats → bass → clap → vocal chop
  - Lo-fi/Soul: chords → bass → kick → snare → texture
  - Ambient: pad → texture → drone → subtle rhythm
  - DnB/Jungle: break → bass → pad → melody
  - Trip Hop: drums → bass → pad → melody → texture
  - Boom Bap: drums → bass → sample/melody → texture

### Tension and release
- **Build** tension by: adding layers, opening filters, increasing density, adding dissonance.
- **Release** tension by: dropping elements, closing filters, simplifying, resolving to consonance.
- The build-drop cycle is the fundamental structure of electronic music.

### Filter as arrangement tool
- Opening a low-pass filter (lpf going up) = building energy, revealing brightness.
- Closing it (lpf going down) = pulling back, creating intimacy.
- A slow filter sweep (sine.range LFO) creates movement without changing notes.

### Layering rules
- Every voice should have its own **frequency space**. Don't stack two basses.
- Kick = sub/low (< 200Hz). Bass = low-mid (100-500Hz). Chords = mid (300-2000Hz). Hats = high (2000Hz+).
- Use .lpf() and .hpf() to carve space for each voice.
- If it sounds muddy, remove something. Less is almost always more.

### Gain staging
- No single voice should dominate unless intentionally featured.
- Drums: kick 0.5-0.7, snare 0.3-0.5, hats 0.1-0.3.
- Bass: 0.3-0.5. Chords/pads: 0.2-0.4. Melody: 0.15-0.3.
- The quietest element often adds the most character (ghost notes, textures, subtle delays).

---

## Live Coding Mindset

### One change at a time
- Like a DJ or live musician — make ONE move, listen, then decide the next.
- Each evolution should be a deliberate musical choice, not a rewrite.
- Ask: "What is this track missing?" or "What would make this groove better?"

### Listen to the vibe
- If the rating is low, make a bold change: new key, drop a voice, add something unexpected.
- If the rating is high, make subtle refinements: filter tweak, gain adjustment, slight variation.
- Don't fix what isn't broken. If the groove works, just add texture or variation.

### Musical intention
- Every voice should have a role: timekeeper, harmonic foundation, melodic interest, texture, groove.
- If two voices serve the same role, remove one.
- Name your voices clearly ($kick:, $bass:, $chord:) — it helps you think about arrangement.