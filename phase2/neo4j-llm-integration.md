# How Neo4j Feeds the LLM — Integration Guide

## The Problem You Asked

> "We write, we analyze, but how do we USE Neo4j for the LLM?"

The answer: **query Neo4j → format as text → inject into system prompt**.

The LLM never calls Neo4j directly. It just receives richer context
that makes it generate better music. Like giving a musician a cheat
sheet before they improvise: "last time you played Eb chords with
ghost snares, the crowd loved it."

---

## What Changes in agent.ts

### Before (current code)

```typescript
function buildEvolutionPrompt(skill: Skill): string {
  return buildSystemPrompt(skill) + `

## EVOLUTION RULES
- Make EXACTLY ONE musical change per evolution.
...`;
}
```

The LLM only sees: skill rules + base knowledge + current code.
Every session starts from zero knowledge.

### After (with Neo4j memory)

```typescript
import { buildGraphContext } from './db/graph-context.js';

// In the evolution tick:
async function evolutionTick(s: Session, llm: LlmGateway): Promise<void> {
  // ... existing code ...

  // NEW: Query Neo4j for relevant musical memory
  const graphMemory = await buildGraphContext(
    s.skill!.id,
    s.currentCode
  );

  // NEW: Pass memory into the prompt builder
  const prompt = `Current code:
${s.currentCode}

Musician move: ${move}
${graphMemory}

Apply this ONE change...`;

  const result = await llm.chat(
    buildEvolutionPrompt(s.skill!) + graphMemory,  // memory in system prompt
    [{ role: 'user', content: prompt }]
  );
  // ... rest unchanged ...
}
```

### What the LLM Actually Sees

Without Neo4j memory:
```
You are a music copilot inside a Strudel live coding REPL.
[strudel syntax docs]
[genre rules]
[example voices]

Current code: ...
Musician move: Add a new percussion voice
```

With Neo4j memory (after 2 weeks of streaming):
```
You are a music copilot inside a Strudel live coding REPL.
[strudel syntax docs]
[genre rules]
[example voices]

## LEARNED FROM PAST SESSIONS (use this knowledge)

Moves that worked well for this genre recently:
- "Added ghost snare with degradeBy(0.3)" (worked 8 times, avg +1.2 rating)
- "Filter sweep with sine.range(300,1200).slow(8)" (worked 6 times, avg +0.9 rating)
- "Added rim clicks at gain 0.15" (worked 4 times, avg +0.7 rating)

Voice combinations that listeners liked:
- chord + bass → avg rating 4.3 (12 patterns)
- kick + ghost → avg rating 4.1 (8 patterns)

Drum patterns that worked well with notes [Eb3, G3, Bb3]:
- ghost: s("~ sd:2 ~ ~ sd:2 ~ ~ sd:2").bank("RolandTR808").gain(0.12) (avg rating 4.5, 3 times)
- rim: s("~ rim ~ rim").gain(0.15).degradeBy(0.3) (avg rating 4.2, 5 times)

Under-explored moves worth trying:
- "Euclidean rhythm on percussion" (only tried 2 times but avg +1.5)

Current code: ...
Musician move: Add a new percussion voice
```

The LLM now knows:
1. **What moves have worked** → it picks better evolution moves
2. **What voice combos sound good** → it creates better pairings
3. **What drums match these specific notes** → it makes musically informed choices
4. **What's under-explored** → it tries new things that had promising early results

---

## Three Injection Points

### 1. Evolution Tick (every 60s)

```typescript
// In evolutionTick()
const memory = await buildGraphContext(skill.id, currentCode);
// Inject into system prompt
```

Queries run (~50ms total):
- Best moves for this skill (last 7 days)
- Best voice pairings for this skill
- Under-explored moves (mutation budget)
- Drum pairings for current chord notes

### 2. Human Command Response

```typescript
// In respondToHuman()
const memory = await buildGraphContext(skill.id, currentCode, {
  skipUnexplored: true,  // human has a specific request, don't suggest random stuff
});
```

Same queries minus the mutation suggestions — the human is steering,
so the agent should focus on executing their request with good musical taste.

### 3. Vibe Selection

```typescript
// When user says "!vibe rainy tokyo night"
import { buildVibeContext } from './db/graph-context.js';

const vibeMemory = await buildVibeContext(['rainy', 'tokyo', 'night']);
// Returns: '"rainy" → lofi-dj (avg rating 4.2, used 15 times)'
```

This helps the vibe engine pick the right skill based on past success,
not just keyword matching.

---

## Concrete agent.ts Diff

Here's the minimal change needed in your existing agent.ts:

```diff
+ import { buildGraphContext, buildVibeContext } from './db/graph-context.js';

  // In buildSystemPrompt():
  function buildSystemPrompt(skill: Skill): string {
    // ... existing code unchanged ...
  }

- function buildEvolutionPrompt(skill: Skill): string {
-   return buildSystemPrompt(skill) + `
+ async function buildEvolutionPrompt(skill: Skill, currentCode: string): Promise<string> {
+   const memory = await buildGraphContext(skill.id, currentCode);
+   return buildSystemPrompt(skill) + memory + `

  ## EVOLUTION RULES
  ...`;
  }

  // In evolutionTick():
  async function evolutionTick(s: Session, llm: LlmGateway): Promise<void> {
    // ... existing code ...

-   const result = await llm.chat(buildEvolutionPrompt(s.skill!), [...]);
+   const result = await llm.chat(await buildEvolutionPrompt(s.skill!, s.currentCode), [...]);

    // ... rest unchanged ...
  }

  // In respondToHuman():
  async function respondToHuman(s: Session, llm: LlmGateway): Promise<void> {
    // ... existing code ...

-   const result = await llm.chat(buildSystemPrompt(s.skill!), [...]);
+   const memory = await buildGraphContext(s.skill!.id, code, { skipUnexplored: true });
+   const result = await llm.chat(buildSystemPrompt(s.skill!) + memory, [...]);

    // ... rest unchanged ...
  }
```

That's it. ~10 lines changed. The graph memory flows into the LLM naturally.

---

## Token Budget

The graph context is designed to be compact:

| Section | Typical size | Tokens |
|---------|-------------|--------|
| Best moves (5 items) | ~200 chars | ~60 |
| Voice pairings (5 items) | ~250 chars | ~75 |
| Note insights (3 items) | ~300 chars | ~90 |
| Under-explored (3 items) | ~200 chars | ~60 |
| **Total** | **~950 chars** | **~285** |

That's ~285 tokens added to each prompt. Your current system prompt
is already ~800+ tokens (base knowledge + skill rules + examples).
Adding 285 tokens of *personalized, data-driven musical knowledge*
is an excellent trade-off.

---

## Graceful Degradation

If Neo4j is down or not configured:
- `isConnected()` returns false
- `buildGraphContext()` returns empty string `""`
- Agent works exactly as before — zero impact
- No try/catch needed in agent.ts

If a query fails:
- Individual sections fail silently
- Other sections still contribute
- Console.error logged for debugging

This means you can develop and test without Neo4j,
then add it when your Aura instance is ready.

---

## Day 1 vs Day 30

**Day 1**: Graph is empty. `buildGraphContext()` returns "".
Agent works exactly as it does now. No difference.

**Day 7**: ~10,000 patterns in graph. Context starts appearing:
"Added filter sweep worked 3 times." Still basic.

**Day 30**: ~43,000 patterns. Rich context:
"Ghost snares with Eb chords rated 4.3 across 12 patterns.
Filter sweeps below 800Hz consistently outperform those above 1500Hz.
Cross-genre discovery: jazz chord voicings work in lo-fi context."

The agent genuinely improves. Not because the code changed,
but because the data backing the prompts got richer.
