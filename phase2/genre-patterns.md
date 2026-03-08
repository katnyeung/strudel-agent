# Genre Pattern Reference

Concrete drum, bass, chord, and variation patterns per genre.
ALL drum patterns use .beat(positions, 16) for grid-locked timing.
Use these as starting points and adapt to the current context.

---

## ⚠️ Pattern Rules

1. ALL drum voices use `.beat(positions, 16)` — never mix step counts
2. Bass uses 4 or 8 events per cycle with rests (~), no .slow()
3. Chords use `<>` angle brackets to step one per cycle
4. Apply .swing() with the SAME value to ALL voices that need swing
5. Use .bank("RolandTR808") or .bank("RolandTR909") consistently within a pattern

---

## Drum Patterns

### Techno (120-130 BPM, straight, no swing)

```
// Minimal — four on the floor
$kick: sound("bd:3").beat("0,4,8,12", 16).bank("RolandTR909").gain(0.7)

// Medium — with clap backbeat
$kick: sound("bd:3").beat("0,4,8,12", 16).bank("RolandTR909").gain(0.7)
$clap: sound("cp").beat("4,12", 16).bank("RolandTR909").gain(0.5).room(0.3)

// Full — offbeat hats
$kick: sound("bd:3").beat("0,4,8,12", 16).bank("RolandTR909").gain(0.7)
$clap: sound("cp").beat("4,12", 16).bank("RolandTR909").gain(0.5).room(0.3)
$hat: sound("hh:2").beat("2,6,10,14", 16).bank("RolandTR909").gain(0.25).hpf(5000)

// Complex — with ghost hats and open hat
$kick: sound("bd:3").beat("0,4,8,12", 16).bank("RolandTR909").gain(0.7)
$clap: sound("cp").beat("4,12", 16).bank("RolandTR909").gain(0.5).room(0.3)
$hat: sound("hh:2").beat("2,6,10,14", 16).bank("RolandTR909").gain(0.25).hpf(5000)
$oh: sound("oh").beat("6,14", 16).bank("RolandTR909").gain(0.2).hpf(4000)
$ghost: sound("hh").beat("1,3,5,7,9,11,13,15", 16).bank("RolandTR909").gain(0.08).hpf(6000)
```

### House (120-128 BPM, slight swing 0.05)

```
// Minimal
$kick: sound("bd").beat("0,4,8,12", 16).bank("RolandTR909").gain(0.7).swing(0.05)
$hat: sound("hh").beat("2,6,10,14", 16).bank("RolandTR909").gain(0.3).swing(0.05)

// Medium
$kick: sound("bd").beat("0,4,8,12", 16).bank("RolandTR909").gain(0.7).swing(0.05)
$clap: sound("cp").beat("4,12", 16).bank("RolandTR909").gain(0.5).swing(0.05).room(0.3)
$hat: sound("hh").beat("2,6,10,14", 16).bank("RolandTR909").gain(0.3).swing(0.05)

// Full
$kick: sound("bd").beat("0,4,8,12", 16).bank("RolandTR909").gain(0.7).swing(0.05)
$clap: sound("cp").beat("4,12", 16).bank("RolandTR909").gain(0.5).swing(0.05).room(0.3)
$hat: sound("hh").beat("0,2,4,6,8,10,12,14", 16).bank("RolandTR909").gain(0.25).swing(0.05)
$oh: sound("oh").beat("6,14", 16).bank("RolandTR909").gain(0.2).swing(0.05)
```

### Lo-fi Hip-hop (70-85 BPM, swing 0.15-0.25)

```
// Minimal — lazy swing
$kick: sound("bd:1").beat("0,6,10,14", 16).bank("RolandTR808").gain(0.6).swing(0.2)
$snare: sound("sd:2").beat("4,12", 16).bank("RolandTR808").gain(0.45).swing(0.2).room(0.3)

// Medium — with dusty hats
$kick: sound("bd:1").beat("0,6,10,14", 16).bank("RolandTR808").gain(0.6).swing(0.2)
$snare: sound("sd:2").beat("4,12", 16).bank("RolandTR808").gain(0.45).swing(0.2).room(0.3)
$hat: sound("hh").beat("0,2,4,6,8,10,12,14", 16).bank("RolandTR808").gain(rand.range(0.1, 0.25)).swing(0.2).degradeBy(0.15).lpf(3500)

// Full — ghost notes and texture
$kick: sound("bd:1").beat("0,6,10,14", 16).bank("RolandTR808").gain(0.6).swing(0.2)
$snare: sound("sd:2").beat("4,12", 16).bank("RolandTR808").gain(0.45).swing(0.2).room(0.3)
$ghost: sound("sd:2").beat("2,7,11,15", 16).bank("RolandTR808").gain(0.12).swing(0.2)
$hat: sound("hh").beat("0,2,4,6,8,10,12,14", 16).bank("RolandTR808").gain(rand.range(0.1, 0.25)).swing(0.2).degradeBy(0.2).lpf(3500).pan(sine.range(0.3, 0.7).slow(4))
$rim: sound("rim").beat("2,10", 16).bank("RolandTR808").gain(0.15).swing(0.2).degradeBy(0.3)
```

### Soul / Neo-Soul (75-95 BPM, swing 0.2-0.3)

```
// Minimal — pocket groove
$kick: sound("bd:1").beat("0,6,10", 16).bank("RolandTR808").gain(0.5).swing(0.25)
$snare: sound("sd:2").beat("4,12", 16).bank("RolandTR808").gain(0.35).swing(0.25).room(0.3)

// Medium — with ghost notes
$kick: sound("bd:1").beat("0,6,10,14", 16).bank("RolandTR808").gain(0.5).swing(0.25)
$snare: sound("sd:2").beat("4,12", 16).bank("RolandTR808").gain(0.35).swing(0.25).room(0.3)
$ghost: sound("sd:2").beat("7,15", 16).bank("RolandTR808").gain(0.1).swing(0.25)
$rim: sound("rim").beat("2,6,10,14", 16).bank("RolandTR808").gain(0.12).swing(0.25).degradeBy(0.3)
```

### Jazz (100-140 BPM, swing 0.25-0.35)

```
// Minimal — ride + walking feel
$ride: sound("hh").beat("0,3,4,7,8,11,12,15", 16).gain(0.3).swing(0.3).hpf(4000)
$kick: sound("bd").beat("0,10", 16).bank("RolandTR808").gain(0.4).swing(0.3)

// Medium — brushes
$ride: sound("hh").beat("0,3,4,7,8,11,12,15", 16).gain(0.3).swing(0.3).hpf(4000)
$kick: sound("bd").beat("0,10", 16).bank("RolandTR808").gain(0.4).swing(0.3)
$snare: sound("sd:2").beat("4,12", 16).bank("RolandTR808").gain(0.2).swing(0.3).room(0.35).degradeBy(0.15)

// Full — with ghost snares
$ride: sound("hh").beat("0,3,4,7,8,11,12,15", 16).gain(0.3).swing(0.3).hpf(4000)
$kick: sound("bd").beat("0,10", 16).bank("RolandTR808").gain(0.4).swing(0.3)
$snare: sound("sd:2").beat("4,12", 16).bank("RolandTR808").gain(0.2).swing(0.3).room(0.35).degradeBy(0.15)
$ghost: sound("sd:2").beat("1,5,9,13", 16).bank("RolandTR808").gain(0.08).swing(0.3)
```

### Minimal Techno (120-128 BPM, straight, no swing)

```
// Minimal — locked kick
$kick: sound("bd:3").beat("0,4,8,12", 16).bank("RolandTR909").gain(0.7).lpf(3000)

// Medium — offbeat hats
$kick: sound("bd:3").beat("0,4,8,12", 16).bank("RolandTR909").gain(0.7).lpf(3000)
$hat: sound("hh:2").beat("2,6,10,14", 16).bank("RolandTR909").gain(0.25).hpf(5000)

// Full — with clap and percussion
$kick: sound("bd:3").beat("0,4,8,12", 16).bank("RolandTR909").gain(0.7).lpf(3000)
$hat: sound("hh:2").beat("2,6,10,14", 16).bank("RolandTR909").gain(0.25).hpf(5000)
$clap: sound("cp").beat("4,12", 16).bank("RolandTR909").gain(0.4).room(0.3)
$rim: sound("rim").beat("4,10,14", 16).bank("RolandTR909").gain(0.15)
```

### Drum & Bass (170+ BPM, straight)

```
// Minimal — two-step break
$kick: sound("bd").beat("0,10", 16).bank("RolandTR909").gain(0.7)
$snare: sound("sd:3").beat("4,12", 16).bank("RolandTR909").gain(0.65)

// Medium — with hats
$kick: sound("bd").beat("0,10", 16).bank("RolandTR909").gain(0.7)
$snare: sound("sd:3").beat("4,12", 16).bank("RolandTR909").gain(0.65)
$hat: sound("hh").beat("0,2,4,6,8,10,12,14", 16).bank("RolandTR909").gain(0.2).hpf(5000)

// Full — syncopated kick + ghost snare
$kick: sound("bd").beat("0,6,10", 16).bank("RolandTR909").gain(0.7)
$snare: sound("sd:3").beat("4,12", 16).bank("RolandTR909").gain(0.65)
$ghost: sound("sd:2").beat("2,8,14", 16).bank("RolandTR909").gain(0.15)
$hat: sound("hh").beat("0,2,4,6,8,10,12,14", 16).bank("RolandTR909").gain(0.2).hpf(5000)
```

### Trip Hop (80-100 BPM, swing 0.1)

```
// Minimal — sparse and dark
$kick: sound("bd").beat("0,10", 16).bank("RolandTR808").gain(0.7).swing(0.1).room(0.4)
$snare: sound("sd:3").beat("12", 16).bank("RolandTR808").gain(0.6).swing(0.1).room(0.5)

// Medium — with ghost texture
$kick: sound("bd").beat("0,6,10", 16).bank("RolandTR808").gain(0.7).swing(0.1).room(0.4)
$snare: sound("sd:3").beat("4,12", 16).bank("RolandTR808").gain(0.6).swing(0.1).room(0.5)
$hat: sound("hh").beat("0,2,4,6,8,10,12,14", 16).bank("RolandTR808").gain(0.2).swing(0.1).hpf(5000).pan(sine.range(0.3, 0.7))
$ghost: sound("sd:2").beat("7,15", 16).bank("RolandTR808").gain(0.12).swing(0.1).room(0.4)
```

### Boom Bap (85-95 BPM, swing 0.1-0.15)

```
// Minimal — hard hits
$kick: sound("bd").beat("0,5,10,14", 16).bank("RolandTR808").gain(0.8).swing(0.12)
$snare: sound("sd:3").beat("4,12", 16).bank("RolandTR808").gain(0.7).swing(0.12)

// Medium — with crisp hats
$kick: sound("bd").beat("0,5,10,14", 16).bank("RolandTR808").gain(0.8).swing(0.12)
$snare: sound("sd:3").beat("4,12", 16).bank("RolandTR808").gain(0.7).swing(0.12)
$hat: sound("hh").beat("0,2,4,6,8,10,12,14", 16).bank("RolandTR808").gain(0.4).swing(0.12).hpf(4000)
$oh: sound("oh").beat("6,14", 16).bank("RolandTR808").gain(0.25).swing(0.12)

// Full — with variation
$kick: sound("bd").beat("<0,5,10,14 0,5,8,10,14>", 16).bank("RolandTR808").gain(0.8).swing(0.12)
$snare: sound("sd:3").beat("4,12", 16).bank("RolandTR808").gain(0.7).swing(0.12)
$hat: sound("hh").beat("0,2,4,6,8,10,12,14", 16).bank("RolandTR808").gain(0.4).swing(0.12).hpf(4000)
$oh: sound("oh").beat("6,14", 16).bank("RolandTR808").gain(0.25).swing(0.12)
$rim: sound("rim").beat("2,10", 16).bank("RolandTR808").gain(0.15).swing(0.12)
```

### Trap (130-170 BPM, swing 0-0.1)

```
// Minimal — 808 kick + clap
$kick: sound("bd:4").beat("0,8", 16).bank("RolandTR808").gain(0.8)
$clap: sound("cp").beat("4,12", 16).bank("RolandTR808").gain(0.6)

// Medium — rapid hats
$kick: sound("bd:4").beat("0,8", 16).bank("RolandTR808").gain(0.8)
$clap: sound("cp").beat("4,12", 16).bank("RolandTR808").gain(0.6)
$hat: sound("hh").beat("0,2,4,6,8,10,12,14", 16).bank("RolandTR808").gain(0.3)

// Full — double hat rolls
$kick: sound("bd:4").beat("0,6,8", 16).bank("RolandTR808").gain(0.8)
$clap: sound("cp").beat("4,12", 16).bank("RolandTR808").gain(0.6)
$hat: sound("hh").beat("0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15", 16).bank("RolandTR808").gain(0.25)
$oh: sound("oh").beat("6,14", 16).bank("RolandTR808").gain(0.2)
```

### Ambient (no strict beat, use mini-notation here)

```
// Minimal — very sparse, room is the instrument
$pulse: sound("bd").beat("0", 16).gain(0.4).room(0.9)

// Subtle texture
$dust: sound("hh").beat("4,12", 16).gain(0.08).room(0.8).degradeBy(0.5).lpf(2000)
```

---

## Bassline Patterns

All bass patterns use 4 or 8 events per cycle. NO .slow() on bass.
Shown in C minor. Transpose by changing note names.

### Techno — root pulse
```
$bass: note("C2 C2 C2 C2").sound("square").lpf(sine.range(200, 800).slow(8)).gain(0.4)
```

### House — root + octave
```
$bass: note("C2 ~ C3 ~").sound("sine").lpf(600).gain(0.5)
```

### Lo-fi Hip-hop — walking roots
```
$bass: note("C2 ~ C2 ~ Eb2 ~ F2 ~").sound("triangle").lpf(350).gain(0.4)
```

### Soul / Neo-Soul — walking through chord tones
```
$bass: note("Eb2 ~ F2 G2 ~ Ab2 G2 ~").sound("triangle").lpf(400).gain(0.45)
```

### Jazz — walking bass (one note per beat)
```
$bass: note("C2 D2 Eb2 F2").sound("triangle").lpf(500).gain(0.45).swing(0.3)
```

### Minimal Techno — filter is the melody
```
$bass: note("C2 C2 C2 C2 ~ C2 C2 ~").sound("square").lpf(sine.range(200, 800).slow(8)).gain(0.4)
```

### Drum & Bass — sub weight
```
$bass: note("C1 ~ ~ C2 ~ C1 ~ ~").sound("sine").lpf(80).gain(0.65)
```

### Trip Hop — dark and sparse
```
$bass: note("C1 ~ ~ C1 ~ F1 ~ ~").sound("sine").lpf(120).gain(0.7).room(0.3)
```

### Boom Bap — punchy short notes
```
$bass: note("C1 ~ C1 ~ C1 F1 ~ ~").sound("sawtooth").lpf(200).gain(0.7)
```

### Ambient — drone, no rhythm
```
$drone: note("C1").sound("sine").lpf(150).gain(0.3)
```

---

## Chord Patterns

Use `<>` angle brackets so chords step one per cycle (one per bar).
This automatically aligns with the drum grid.

### Lo-fi Hip-hop
```
$chord: chord("<Cm7 Fm7 Abmaj7 G7>").voicing().sound("sawtooth").lpf(sine.range(500, 1200).slow(8)).gain(0.3).room(0.6)
```

### Soul / Neo-Soul
```
$keys: chord("<Ebmaj7 Abmaj7 Fm9 Bb7>").voicing().sound("sawtooth").lpf(1200).room(0.6).gain(0.35)
```

### Jazz
```
$chord: chord("<Dm7 G7 Cmaj7 Am7>").voicing().sound("sawtooth").lpf(1500).gain(0.25).room(0.4).swing(0.3).degradeBy(0.2)
```

### Minimal Techno — stab (not sustained chord)
```
$stab: chord("<Cm Cm Cm Cm>").voicing().sound("sawtooth").lpf(sine.range(400, 1500).slow(16)).gain(0.2)
```

### Ambient — slow evolving pad
```
$pad: note("<C4 E4 G4>").sound("supersaw").lpf(sine.range(300, 1500).slow(16)).room(0.9).gain(0.25)
```

### Trip Hop — dark minor chords
```
$pad: chord("<Cm7 Fm7 Gm7 Cm7>").voicing().sound("sawtooth").lpf(800).room(0.6).gain(0.25)
```

---

## 16-Step Grid Reference

```
Position:  0  1  2  3  4  5  6  7  8  9  10 11 12 13 14 15
Beat:      1  .  &  .  2  .  &  .  3  .  &  .  4  .  &  .
Count:     1  e  &  a  2  e  &  a  3  e  &  a  4  e  &  a

Four on the floor:  0,4,8,12          (kick every beat)
Backbeat:           4,12              (snare on 2 and 4)
Offbeat hats:       2,6,10,14         (& of each beat)
Eighth-note hats:   0,2,4,6,8,10,12,14
Sixteenth hats:     all 16 positions
Tresillo:           0,3,6,10          (Latin clave base)
```

---

## Variation Techniques

Apply to individual voices for movement. Keep ALL drums on the same grid.

| Type | Modifier | Effect |
|------|----------|--------|
| Hat dynamics | `.gain(rand.range(0.1, 0.25))` | Random velocity per hit |
| Hat thinning | `.degradeBy(0.2)` | Drop 20% of hat hits randomly |
| Kick variation | `.beat("<0,4,8,12 0,4,6,10,14>", 16)` | Alternate kick pattern every bar |
| Filter movement | `.lpf(sine.range(500, 2000).slow(8))` | Slow filter sweep |
| Stereo movement | `.pan(sine.range(0.3, 0.7).slow(4))` | Gentle L-R sweep |
| Every-N fills | `.every(4, x => x.fast(2))` | Double speed every 4 bars |
| Occasional reverse | `.sometimesBy(0.1, x => x.rev)` | Rare pattern reverse |

---

## Common Beat Positions by Feel

### Straight / Driving (techno, house, DnB)
- Kick: 0,4,8,12 (four-on-the-floor) or 0,8 (half-time)
- Snare/clap: 4,12 (backbeat)
- Hats: 2,6,10,14 (offbeat) or all even numbers (eighth notes)

### Swung / Laid-back (lo-fi, soul, jazz, boom bap)
- Kick: 0,6,10,14 (syncopated) or 0,5,10,14
- Snare: 4,12 (backbeat stays on grid even with swing)
- Hats: 0,2,4,6,8,10,12,14 with .degradeBy(0.15)
- Ghost: 2,7,11,15 at very low gain (0.08-0.12)
- ALL voices get the same .swing() value

### Sparse / Moody (ambient, trip hop)
- Kick: 0 or 0,10 (minimal presence)
- Snare: 12 only (once per bar) or 4,12
- Hats: 4,12 with .degradeBy(0.5) and .room(0.8)
