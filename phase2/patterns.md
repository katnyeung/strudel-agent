# Genre Pattern Reference

Concrete drum, bass, and variation patterns per genre. Use these as starting points and adapt to the current context. All patterns use `$name:` voice syntax.

---

## Drum Patterns

### Techno
```
// Minimal
$kick: s("bd*4").gain(0.8)

// Medium
$kick: s("bd*4").gain(0.8)
$snare: s("~ cp ~ cp").gain(0.6)

// Full
$kick: s("bd*4").gain(0.8)
$snare: s("~ cp ~ cp").gain(0.6)
$hat: s("hh*8").gain(0.4)

// Complex
$kick: s("bd*4").gain(0.8)
$snare: s("~ cp ~ cp").gain(0.6)
$hat: s("[~ hh]*4").gain(0.4)
$oh: s("oh ~ ~ ~").gain(0.3).swing(0.05)
```

### House
```
// Minimal
$kick: s("bd*4").gain(0.8)
$hat: s("hh*8").gain(0.4)

// Medium
$kick: s("bd*4").gain(0.8)
$hat: s("hh*8").gain(0.4)
$snare: s("~ cp ~ cp").gain(0.6)

// Full
$kick: s("bd*4").gain(0.8)
$hat: s("[~ hh]*4").gain(0.4)
$snare: s("~ cp ~ cp").gain(0.6)
$oh: s("oh ~ oh ~").gain(0.3)

// Complex — add fills every 4 bars
$kick: s("bd*4").gain(0.8)
$hat: s("[~ hh]*4").gain(0.4).every(4, x => x.fast(2))
$snare: s("~ cp ~ cp").gain(0.6)
```

### Lo-fi Hip-hop
```
// Minimal — lazy swing
$kick: s("bd ~ ~ bd ~ ~ bd ~").bank("RolandTR808").gain(0.6).swing(0.15)
$snare: s("~ ~ sd ~ ~ sd ~ ~").bank("RolandTR808").gain(0.45).swing(0.15).room(0.3)

// Medium — with dusty hats
$kick: s("bd ~ ~ bd ~ ~ bd ~").bank("RolandTR808").gain(0.6).swing(0.2)
$snare: s("~ ~ sd ~ ~ sd ~ ~").bank("RolandTR808").gain(0.45).swing(0.2).room(0.3)
$hat: s("hh*8").gain(rand.range(0.1, 0.25)).degradeBy(0.15).lpf(3500)

// Full — ghost notes and texture
$kick: s("bd ~ ~ bd ~ ~ bd ~").bank("RolandTR808").gain(0.6).swing(0.2)
$snare: s("~ ~ sd ~ ~ sd ~ ~").bank("RolandTR808").gain(0.45).swing(0.2).room(0.3)
$ghost: s("~ sd:2 ~ ~ sd:2 ~ ~ sd:2").bank("RolandTR808").gain(0.12).swing(0.2)
$hat: s("hh*8").gain(rand.range(0.1, 0.25)).degradeBy(0.2).lpf(3500).pan(sine.range(0.3, 0.7).slow(4))
$rim: s("~ rim ~ rim").bank("RolandTR808").gain(0.15).degradeBy(0.3)
```

### Drum & Bass
```
// Minimal — broken kick pattern
$kick: s("bd ~ ~ bd ~ ~ bd ~").gain(0.8)
$snare: s("~ ~ cp ~ ~ cp ~ ~").gain(0.7)

// Medium
$kick: s("bd ~ ~ [bd bd] ~ ~ bd ~").gain(0.8)
$snare: s("~ ~ cp ~ ~ cp ~ ~").gain(0.7)
$hat: s("hh*16").gain(0.3)

// Full — double-time
$kick: s("bd ~ ~ [bd bd] ~ ~ bd ~").gain(0.8).fast(2)
$snare: s("~ ~ cp ~ [~ cp] ~ cp ~ ~").gain(0.7).fast(2)
$hat: s("hh*16").gain(0.3).fast(2)
```

### Breakbeat
```
// Minimal — syncopated kick
$kick: s("bd ~ ~ bd ~ ~ ~ bd").gain(0.8)
$snare: s("~ cp ~ ~ cp ~").gain(0.7)

// Medium
$kick: s("bd ~ ~ bd ~ [~ bd] ~ bd").gain(0.8)
$snare: s("~ cp ~ ~ cp ~").gain(0.7)
$hat: s("hh*8").gain(0.35)

// Full — heavy swing
$kick: s("bd ~ [~ bd] bd ~ [~ bd] ~ bd").gain(0.8)
$snare: s("~ cp ~ ~ cp [~ cp]").gain(0.7)
$hat: s("hh*8").gain(0.35).swing(0.1)
```

### Trap
```
// Minimal
$kick: s("bd*2").gain(0.9)
$snare: s("~ cp ~ cp").gain(0.7)

// Medium — hat rolls
$kick: s("bd*2").gain(0.9)
$snare: s("~ cp ~ cp").gain(0.7)
$hat: s("hh*8").gain(0.35).every(2, x => x.fast(2))

// Full — heavy swing, rapid hats
$kick: s("bd [bd bd] ~ bd").gain(0.9)
$snare: s("~ cp ~ cp").gain(0.7)
$hat: s("hh*16").gain(0.3).swing(0.2)
```

### Jungle
```
// Minimal — fast broken beat
$kick: s("bd ~ [~ bd] bd ~ ~ bd ~").gain(0.8).fast(2)
$snare: s("~ cp ~ ~ cp ~").gain(0.7).fast(2)

// Full — layered fast breaks
$kick: s("bd ~ [~ bd] bd ~ [bd bd] bd ~").gain(0.8).fast(2)
$snare: s("~ cp ~ [~ cp] cp ~").gain(0.7).fast(2)
$hat: s("hh*32").gain(0.25).fast(2)
```

### Ambient
```
// Minimal — very sparse
$kick: s("bd ~ ~ ~").gain(0.5)

// Medium — with room
$kick: s("bd ~ ~ ~").gain(0.5).room(0.9)
$hat: s("~ ~ ~ hh:8").gain(0.3).room(0.9)

// Full — spacious
$kick: s("bd ~ ~ ~").gain(0.5).room(0.9)
$hat: s("~ ~ ~ hh:8").gain(0.3).room(0.9)
$oh: s("~ ~ oh:5 ~").gain(0.25).room(0.9)
```

### Experimental
```
// Euclidean rhythms
$kick: s("bd").euclid(5, 8).gain(0.7)

// Polymetric
$kick: s("bd").euclid(5, 8).gain(0.7)
$snare: s("cp").euclid(7, 16).gain(0.5)
```

### Intelligent DnB (LTJ Bukem style)
```
// Minimal — sparse break
$break: s("breaks165").fit().slice(8, "0 ~ ~ 3 ~ ~ 6 ~").gain(0.5).room(0.3).lpf(5000)

// Medium — classic rolling break
$break: s("breaks165").fit().slice(8, "0 0 6 3 0 2 6 7").gain(0.7).room(0.2)

// Full — layered breaks with kick reinforcement
$break: s("breaks165").fit().slice(8, "0 0 6 3 0 2 6 7").gain(0.65).room(0.2)
$ghost: s("breaks165").fit().chop(16).gain(0.12).hpf(3000).room(0.4)
$kick: s("bd ~ ~ ~ [~ bd] ~ bd ~").bank("RolandTR909").gain(0.45).lpf(100)
```

### Trip Hop (Portishead / Massive Attack style)
```
// Minimal — sparse and moody
$kick: s("bd ~ ~ ~").gain(0.7).room(0.5)
$snare: s("~ ~ ~ sd:3").gain(0.6).room(0.5)

// Medium — half-time feel
$kick: s("bd ~ ~ bd ~ ~ bd ~").gain(0.8)
$snare: s("~ ~ ~ ~ sd ~ ~ ~").bank("RolandTR808").gain(0.7).room(0.4)
$hat: s("hh*8").gain(0.25).hpf(6000).pan(sine.range(0.3, 0.7))

// Full — layered with ghost snares
$kick: s("bd ~ [~ bd] ~ bd ~ ~ ~").gain(0.8)
$snare: s("~ ~ ~ ~ sd ~ ~ ~").bank("RolandTR808").gain(0.7).room(0.5)
$ghost: s("~ ~ ~ sd:3? ~ ~ sd:2? ~").bank("RolandTR808").gain(0.2).room(0.4)
$hat: s("hh*8").gain(perlin.range(0.15, 0.3)).hpf(5000)
$oh: s("~ oh ~ ~ ~ oh ~ ~").bank("RolandTR808").gain(0.2).room(0.6)
```

### Boom Bap (DJ Premier / Alchemist style)
```
// Minimal — hard kick and snare
$kick: s("bd ~ ~ ~ sd ~ ~ ~, bd ~ ~ ~ sd ~ bd ~").gain(0.9)

// Medium — with crispy hats
$kick: s("bd ~ ~ ~ sd ~ ~ ~, bd ~ ~ bd sd ~ bd ~").gain(0.9)
$hat: s("hh*8").gain(0.4).hpf(5000)
$oh: s("~ ~ oh ~ ~ ~ oh ~").gain(0.3)

// Full — golden era layered
$kick: s("bd ~ ~ [~ bd] sd ~ ~ ~, bd ~ ~ bd sd ~ [bd bd] ~").gain(0.9)
$snare: s("~ ~ ~ ~ sd:3 ~ ~ ~").gain(0.3).room(0.2)
$hat: s("[~ hh]*8").gain(0.45).hpf(4000)
$oh: s("~ ~ oh ~ ~ ~ ~ oh:2").gain(0.25).room(0.3)
```

---

## Bassline Patterns

All examples shown in **C minor**. To transpose to another key, change the note names:

| Interval | C minor | Eb minor | F minor | Ab minor |
|----------|---------|----------|---------|----------|
| Root     | C       | Eb       | F       | Ab       |
| Minor 3rd| Eb      | Gb       | Ab      | B        |
| 4th      | F       | Ab       | Bb      | Db       |
| 5th      | G       | Bb       | C       | Eb       |
| Minor 7th| Bb      | Db       | Eb      | Gb       |

### Techno
```
$bass: note("C2 C2 C2 C2").sound("sawtooth").lpf(800).gain(0.7)
```

### House
```
$bass: note("C2 ~ C2 ~").sound("sine").gain(0.8)
```

### Lo-fi Hip-hop
```
$bass: note("C2 ~ C2 ~ Eb2 ~ F2 ~").sound("triangle").slow(2).lpf(350).gain(0.4)
```

### Drum & Bass
```
$bass: note("C1 ~ ~ C2 ~ C1 ~ ~").sound("square").lpf(400).gain(0.7)
```

### Acid
```
$bass: note("C2 C3 C2 Eb2").sound("sawtooth").lpf(sine.range(200, 2000).slow(4)).gain(0.7)
```

### Dub
```
$bass: note("C1 ~ ~ ~ C1 ~ G1 ~").sound("sine").room(0.5).gain(0.7)
```

### Funk
```
$bass: note("C2 C2 ~ G2 ~ C2 Bb2 ~").sound("square").lpf(1200).gain(0.7)
```

### Jazz
```
$bass: note("C2 ~ F2 ~ Bb2 ~").sound("sine").gain(0.7)
```

### Ambient
```
$bass: note("C1").sound("sine").attack(2).release(4).gain(0.6)
```

### Intelligent DnB
```
$bass: note("<C1 ~ C1 ~> <F1 ~ ~ F1> <Bb0 ~ Bb0 ~> <Eb1 ~ ~ ~>")
  .sound("sine").gain(0.65).lpf(80)
  .attack(0.01).decay(0.2).sustain(0.5).release(0.4)
```

### Trip Hop
```
$bass: note("<C1 ~ ~ C1> <~ F1 ~ ~> <G1 ~ C1 ~> <~ ~ F1 ~>")
  .sound("sine").gain(0.7).lpf(120)
  .attack(0.02).decay(0.3).sustain(0.6).release(0.8).room(0.3)
```

### Boom Bap
```
$bass: note("<C1 ~ C1 ~> <C1 F1 ~ ~> <C1 ~ G1 ~> <F1 ~ C1 ~>")
  .sound("sawtooth").gain(0.7).lpf(200)
  .attack(0.01).decay(0.15).sustain(0.4).release(0.3)
```

---

## Variation Techniques

Apply these to any voice to create movement over time:

| Type | Modifier | Effect |
|------|----------|--------|
| Subtle | `.sometimes(x => x.fast(2))` | Occasionally double speed |
| Moderate | `.every(4, x => x.rev).sometimes(x => x.fast(2))` | Reverse every 4 + occasional doubles |
| Extreme | `.every(2, x => x.jux(rev)).sometimes(x => x.iter(4))` | Stereo reverse + iteration |
| Glitch | `.sometimes(x => x.chop(8).rev).rarely(x => x.speed(-1))` | Chop-reverse + rare backwards |
| Evolving | `.slow(4).every(8, x => x.fast(2)).every(16, x => x.palindrome)` | Long slow evolution |

---

## Fill / Transition Patterns

Use these for drum fills at transitions (e.g., every 8 or 16 bars):

```
// Techno fill
$fill: s("bd*8, cp*4").gain(0.7)

// House fill
$fill: s("bd*4, cp*2, hh*16").gain(0.6)

// Lo-fi fill — soft roll
$fill: s("sd*4, hh*8").bank("RolandTR808").gain(0.4).swing(0.2).room(0.3)

// DnB fill
$fill: s("bd*8, sn*8").fast(2).gain(0.7)

// Trap fill — hat rolls
$fill: s("bd*4, hh*32").gain(0.6)

// Breakbeat fill
$fill: s("bd cp bd cp, hh*8").iter(4).gain(0.7)

// Intelligent DnB fill — break chop
$fill: s("breaks165").fit().slice(16, "0 2 4 6 8 10 12 14 1 3 5 7 9 11 13 15").gain(0.7)

// Trip Hop fill
$fill: s("bd ~ sd ~, hh*4").room(0.5).gain(0.6)

// Boom Bap fill
$fill: s("bd sd bd sd, hh*8").swing(0.1).gain(0.7)
```
