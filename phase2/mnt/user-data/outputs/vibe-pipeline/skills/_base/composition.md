# Music Composition — Fundamentals for Live Coding

## Rhythm

### What is rhythm?
Rhythm is the pattern of sounds and silences in time. It's the skeleton of music — without it, notes are just a wash of sound.

### Pulse and BPM
- The **pulse** (beat) is the steady heartbeat. Listeners tap their foot to it.
- BPM (beats per minute) sets the energy: 60-80 = chill/ambient, 80-100 = hip-hop/soul, 100-130 = house/techno, 130-170 = drum & bass/jungle.
- In Strudel, setcps(BPM/60/4) converts BPM to cycles per second.

### Subdivision
- A beat can be divided: halves (eighth notes), quarters (sixteenth notes), thirds (triplets).
- Sixteenth notes ("hh*16") give energy. Eighth notes ("hh*8") are more relaxed.
- Mixing subdivisions creates interest — a kick on quarters with hats on sixteenths.

### The kick-snare relationship
- **Kick** provides the low-end pulse. Where the kick hits defines the groove's character.
- **Snare/clap** is the backbeat — usually on beats 2 and 4 (steps 4 and 12 in a 16-step grid).
- Four-on-the-floor: kick on every beat (0,4,8,12). Foundation of house/techno.
- Breakbeat: kick pattern is irregular, syncopated. Foundation of hip-hop/jungle.

### Swing and groove
- **Straight** timing = robotic, precise. Good for techno.
- **Swing** pushes offbeat notes late, creating a human feel. Essential for jazz, soul, lo-fi.
- .swing(0.1) = subtle warmth. .swing(0.3) = heavy jazz swing.
- Ghost notes (very quiet hits) add pocket and feel. Use low .gain() values (0.05-0.15).

### Syncopation
- Notes that land BETWEEN the main beats. Creates tension and movement.
- Example: kick on step 6 instead of 8 — pushes the groove forward.
- Too much syncopation = chaotic. Balance syncopated elements with steady ones.

### Space and silence
- What you DON'T play is as important as what you play.
- .degradeBy() creates musical space by randomly dropping notes.
- Leave gaps in patterns — "bd ~ ~ bd ~ ~ bd ~" breathes more than "bd bd bd bd".
- Silence before a drop makes the drop hit harder.

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

### Chord progressions
- A **chord** is 3+ notes played together. Chords create the emotional landscape.
- **7th chords** (Dm7, Cmaj7) add sophistication. Essential for jazz, soul, lo-fi.
- **9th/11th/13th** chords add even more color. Use sparingly.
- Common progressions:
  - ii-V-I (Dm7 → G7 → Cmaj7) — the jazz standard.
  - I-vi-IV-V (C → Am → F → G) — pop/soul.
  - i-iv-v (Cm → Fm → Gm) — minor loop, lo-fi/ambient.
- **Slow chord movement**: change chords every 2-4 bars for ambient/lo-fi. Every bar for jazz.

### Chord probability — what real songs do
Based on analysis of thousands of popular songs, here's what chords typically follow each other. Use this to make progressions that feel natural or deliberately surprising:

- After **I**: IV (22%), V (19%), vi (15%), ii (8%). The I→IV→V→I cycle is the backbone of pop.
- After **IV**: I (32%), V (29%), vi (10%). The IV chord almost always resolves to I or V.
- After **V**: I (44%), vi (14%), IV (11%). The V→I resolution is the strongest pull in music.
- After **vi**: IV (26%), V (18%), ii (12%), I (11%). Minor chords love moving to IV.
- After **ii**: V (48%), IV (14%), I (10%). The ii→V is by far the most common two-chord motion.

**Using this**: Follow the high-probability paths for "safe" progressions. Deliberately pick low-probability paths (3-5%) for interesting, unexpected movement. Genre matters — jazz uses ii→V→I constantly, while lo-fi often loops i→iv or i→VI→III→VII.

### Bass and root movement
- The **bass note** anchors the harmony. Usually plays the root of the chord.
- Walking bass: moves stepwise through chord tones. Keeps energy flowing.
- Pedal bass: stays on one note while chords change above. Creates tension.

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
