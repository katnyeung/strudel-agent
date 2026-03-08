# Integration Plan: strudel-mcp-server → ambient-lofi

## Source
- **Repo**: https://github.com/williamzujkowski/strudel-mcp-server
- **License**: MIT — Copyright (c) 2025 William Zujkowski
- **Files of interest**:
  - `src/services/MusicTheory.ts` (204 lines)
  - `src/services/PatternGenerator.ts` (684 lines)

## What they contain (from CLAUDE.md documentation)

### MusicTheory.ts (204 lines)
Pure functions, zero dependencies on MCP/Playwright/browser:
- **15+ scales**: major, minor, dorian, phrygian, lydian, mixolydian,
  locrian, minor pentatonic, major pentatonic, blues, chromatic,
  harmonic minor, melodic minor, whole tone, etc.
- **Chord progressions**: jazz (ii-V-I), pop (I-V-vi-IV), blues (I-IV-V),
  and genre-specific variants
- **Euclidean rhythm generation**: algorithmic rhythms from number of hits + steps
- **Arpeggio generation**: from chord symbols
- **Scale lookup**: getScale(name, root) → array of note names

### PatternGenerator.ts (684 lines)
Pure functions, depends only on MusicTheory.ts:
- **Genre-specific drum patterns**: techno, house, dnb, ambient, trap, jungle, lofi
- **Bassline generation**: genre-aware bass patterns
- **Melody composition**: scale-based melody generation
- **Pattern variations**: subtle, moderate, extreme, glitch, evolving
- **Complete track generation**: generateCompletePattern(genre, key, bpm)
  returns multi-layer Strudel pattern with drums, bass, chords, melody

## Integration Strategy

### Option A: Clone files directly (RECOMMENDED)
1. `git clone` his repo
2. Copy `src/services/MusicTheory.ts` → your `src/music-theory.ts`
3. Copy `src/services/PatternGenerator.ts` → your `src/pattern-generator.ts`
4. Add MIT license header to both files
5. Strip any imports that reference his MCP server, Logger, etc.
6. Adapt the output format to match your $name: voice pattern style
7. Wire into your agent.ts evolution loop

### Option B: npm install + import (simpler but heavier)
```bash
npm install @williamzujkowski/strudel-mcp-server
```
Then import just the services. BUT this also pulls in Playwright,
@modelcontextprotocol/sdk, @google/generative-ai, etc. — heavy
dependencies you don't need. NOT recommended.

### Option C: Extract knowledge into markdown (lightest)
Read his files, extract the data (scale definitions, chord progressions,
rhythm patterns) and add them to your `skills/_base/` markdown files.
Your LLM reads those. Zero code dependency.
Best if you want to keep your codebase minimal.

## Recommended: Option A + C hybrid

1. Copy his two service files (with MIT credit)
2. ALSO extract the best data into enriched `_base/` markdown files
3. Your agent uses the TS functions for deterministic music theory
   (scales, chords, euclidean rhythms) and the LLM for creative decisions

## How it connects to your agent

```
Evolution tick:
  1. Agent picks a move ("add a chord progression")
  2. Calls MusicTheory.getChordProgression('jazz', 'Eb')
     → returns ["Fm7", "Bb7", "Ebmaj7"]
  3. Calls PatternGenerator.generateBassline('lofi', 'C', 78)
     → returns a Strudel bass pattern
  4. Feeds these as CONTEXT to the LLM prompt:
     "Here's a jazz chord progression in Eb: Fm7 Bb7 Ebmaj7.
      Here's a matching bass pattern: [pattern].
      Now write the Strudel code that uses these."
  5. LLM assembles the final code with proper Strudel syntax

The music theory functions provide ACCURACY.
The LLM provides CREATIVITY and TASTE.
```

## Steps to execute

### Step 1: Get the files
```bash
git clone https://github.com/williamzujkowski/strudel-mcp-server.git /tmp/strudel-mcp
cp /tmp/strudel-mcp/src/services/MusicTheory.ts src/music-theory.ts
cp /tmp/strudel-mcp/src/services/PatternGenerator.ts src/pattern-generator.ts
```

### Step 2: Add license headers
Add to top of both files:
```typescript
/**
 * Adapted from strudel-mcp-server by William Zujkowski
 * https://github.com/williamzujkowski/strudel-mcp-server
 * MIT License — Copyright (c) 2025 William Zujkowski
 *
 * Modified for ambient-lofi agent integration.
 */
```

### Step 3: Clean up imports
Remove any references to:
- Logger (replace with console.log)
- MCP SDK types
- Playwright/browser stuff
- Any other external dependencies

Both files should be pure TypeScript with ZERO external deps.

### Step 4: Create THIRD_PARTY_LICENSES file
```
## strudel-mcp-server

MIT License
Copyright (c) 2025 William Zujkowski

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
```

### Step 5: Wire into agent.ts
In your evolution loop and vibe engine, call the music theory
functions to get accurate scales/chords/rhythms, then feed those
as context to the LLM for the creative assembly.

### Step 6: Acknowledge in README
Add to your README.md:
```markdown
## Acknowledgments
- Music theory engine adapted from
  [strudel-mcp-server](https://github.com/williamzujkowski/strudel-mcp-server)
  by William Zujkowski (MIT License)
```

### Step 7 (optional but nice): Open an issue on his repo
Let him know you're building on his work. Could lead to collaboration.
