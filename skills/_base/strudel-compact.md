# Strudel Syntax (Compact)

Strudel is a live coding music language. It is NOT JavaScript. Never use function definitions, variables, loops, or JS syntax.

## Format

Every output follows this exact format — nothing else:
```
setcps(BPM/60/4)
$voice1: sound("sample").beat("positions", 16).gain(0.5)
$voice2: note("C2 ~ E2 ~").sound("synth").lpf(400).gain(0.4)
```

- First line: `setcps(BPM/60/4)` to set tempo
- Each line: `$name:` followed by a method chain. NO semicolons, NO comments
- Voice names: $kick, $snare, $hat, $bass, $chord, $pad, $melody, $perc, $rim, $drone

## Drums — ALWAYS use .beat()

```
$kick: sound("bd:1").beat("0,4,8,12", 16).bank("RolandTR808").gain(0.6)
$snare: sound("sd:2").beat("4,12", 16).bank("RolandTR808").gain(0.45)
$hat: sound("hh").beat("0,2,4,6,8,10,12,14", 16).bank("RolandTR808").gain(0.2)
```

- ALL drums use .beat(positions, 16) with the SAME step count (16)
- Positions: 0-15 only. NEVER use 16 (it wraps to 0)
- Sample variants use COLON: "bd:1", "sd:2", "hh:3"
- Banks: .bank("RolandTR808") or .bank("RolandTR909")
- Swing: .swing(0.2) — apply SAME value to ALL voices

## Bass — 4 or 8 events, NO .slow()

```
$bass: note("C2 ~ C2 ~ Eb2 ~ F2 ~").sound("triangle").lpf(350).gain(0.4)
```

## Chords — angle brackets, one per cycle

```
$chord: chord("<Cm7 Fm7 Am7 G7>").voicing().sound("sawtooth").lpf(1200).gain(0.3)
```

- Root note MUST be uppercase: Cm7, Fm7, Am, G7. NEVER lowercase: cm, fm, am
- Only natural-root chords with .voicing(): C, D, E, F, G, A, B (no sharps/flats as root)
- Valid qualities: m, m7, 7, maj7, dim, aug, sus4, sus2, 9 (e.g. Cm7, G7, Cmaj7, Am)

## Synths

sawtooth, triangle, sine, square, supersaw

## Key Effects

- .lpf(Hz) — low-pass filter (darker)
- .hpf(Hz) — high-pass filter (thinner)
- .room(0-1) — reverb
- .delay(0-1) — delay send
- .pan(0-1) — stereo (0=left, 1=right)
- .degradeBy(0.2) — randomly drop 20% of notes
- .swing(0.2) — push offbeats late
- perlin.range(lo,hi) — smooth random (use for .gain, .lpf, .pan)
- sine.range(lo,hi).slow(N) — smooth LFO sweep

## Valid sound names — ONLY these exist

Drums: bd, sd, hh, cp, oh, rim (with optional variant: "bd:1", "sd:2")
Synths: sawtooth, triangle, sine, square, supersaw
Samples: piano, gm_epiano1, gm_epiano2 (piano/Rhodes sounds, need dirt-samples)
Noise: white

Use .bank() SEPARATELY: `sound("bd:1").bank("RolandTR808")`

## NEVER DO

- NEVER write JavaScript functions, variables, or class definitions
- NEVER use stack(), let, const, var, function, return, import
- NEVER use semicolons or comments in output
- NEVER use .slow() on bass or drums
- NEVER mix .beat() step counts between drums
- NEVER use the pipe character | in patterns
- NEVER combine bank+sound as one name: "RolandTR909_triangle" is INVALID, "RolandTR808_bd" is INVALID
- NEVER invent sample names — only use the exact names listed above
- NEVER use sawtooth for piano — it sounds like a pipe organ. Use sound("piano") for piano.
- NEVER use lowercase chord roots: chord("cm") is INVALID, chord("fm") is INVALID — use chord("Cm"), chord("Fm")
