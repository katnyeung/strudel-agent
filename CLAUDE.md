# CLAUDE.md — Ambient Lo-fi AI Music Copilot

## What This Is

An AI music copilot that generates and evolves live music using **Strudel** (a live coding language for music) in the browser. The AI agent picks a genre "skill", generates multiple pattern candidates, self-evaluates to pick the best, then continuously evolves the music every 60 seconds — like a DJ that never stops improving. Users can steer the music anytime by typing natural language commands.

## Quick Start

```bash
cp .env.example .env        # add your LLM_API_KEY
npm install
npm run dev                  # starts with hot-reload on http://localhost:8080
```

Open `http://localhost:8080` in browser → pick a skill → music starts.

## Architecture

```
Browser (index.html)          Node.js Server (src/)         External
┌──────────────────┐         ┌────────────────────┐        ┌───────────┐
│ Strudel REPL     │◄──ws──►│ server.ts           │───────►│ Claude API│
│ Copilot Panel    │         │   ├─ agent.ts       │        └───────────┘
│ WS Client        │         │   ├─ llm.ts         │
└──────────────────┘         │   ├─ skills.ts      │        ┌───────────┐
                             │   └─ types.ts       │◄──────│ skills/*  │
                             └────────────────────┘        │ (text)    │
                                                           └───────────┘
```

**Key principle**: The server is a thin async layer between the browser and the LLM. All audio happens in the browser (Strudel + Web Audio API). Skills are text files, not code.

## File Map

| File | Lines | Purpose |
|------|-------|---------|
| `src/server.ts` | ~90 | HTTP server, WebSocket handler, static files. Entry point. |
| `src/agent.ts` | ~230 | The copilot brain: bootstrap, evolve, respond to human. |
| `src/llm.ts` | ~80 | LLM gateway: Anthropic native + OpenAI compatible. |
| `src/skills.ts` | ~100 | Skill loader: reads YAML/MD from filesystem. |
| `src/types.ts` | ~80 | All TypeScript interfaces. |
| `web/index.html` | ~350 | Frontend: Strudel REPL + copilot panel. Single file. |
| `skills/*/v1/*` | various | Genre definitions as text files. |

**Total backend**: ~580 lines TypeScript.

## Key Concepts

### The Agent Lifecycle

```
IDLE → (user picks skill) → BOOTSTRAP → EVOLVING ↔ RESPONDING
```

1. **BOOTSTRAP**: Start with one named voice ($bass:, $kick:, etc.) from the skill's foundation step — zero LLM calls
2. **EVOLVING**: Every 60s, agent adds/modifies one named voice (add layer, tweak filter, change chord) and explains why
3. **RESPONDING**: When human types a command, agent pauses evolution, applies the request, then resumes

### Base Knowledge

`skills/_base/strudel.md` — shared Strudel syntax knowledge base loaded into every LLM prompt. This is the single source of truth for how to write Strudel code. Edit this file to teach the LLM new patterns, functions, or correct mistakes. Directories starting with `_` are skipped by the skill loader.

### Skills

Skills live in `skills/{id}/v{n}/` as text files. They define **genre/composition style**, not Strudel syntax:

- `meta.yml` — identity: name, icon, tempo range, tags
- `rules.md` — genre rules (composition style, sound palette, what to do / not do). Written as a creative brief for a musician.
- `build-sequence.yml` — step-by-step build instructions with example Strudel code using named voices ($bass:, $kick:, etc.)
- `changelog.md` — what changed (for humans, not code)

The system auto-loads the **latest version** (highest v number). To evolve a skill:
1. Copy `v1/` to `v2/`
2. Edit the files
3. `POST /api/skills/reload` or restart

### WebSocket Protocol

All communication is JSON over `ws://localhost:8080/ws/agent`.

**Browser → Server:**
```typescript
{ type: 'select_skill', skillId: 'lofi-dj' }
{ type: 'command', command: 'more swing', currentCode: '...' }
{ type: 'code_edit', currentCode: '...' }
{ type: 'rate', rating: 4 }  // 1-5
{ type: 'stop' }
```

**Server → Browser:**
```typescript
{ type: 'skills_list', skills: [...], message: '...' }
{ type: 'code_update', code: 'setcps(0.325)\n$: s("bd*4").gain(0.7)', phase: 'bootstrap', message: '...' }
{ type: 'thinking', phase: 'evolving', message: 'Adding filter sweep...' }
{ type: 'agent_log', message: '...' }
{ type: 'error', message: '...' }
```

### LLM Gateway

Provider-agnostic. Set via env vars:

```
LLM_PROVIDER=anthropic|openai|ollama|litellm|openrouter
LLM_API_KEY=sk-ant-...
LLM_MODEL=claude-sonnet-4-5-20250929
LLM_BASE_URL=  (only for ollama/custom)
```

Zero code changes to swap providers.

## How To: Common Tasks

### Add a new skill

```bash
mkdir -p skills/drum-and-bass/v1
# Create meta.yml, rules.md, build-sequence.yml
# See skills/lofi-dj/v1/ as template
curl -X POST http://localhost:8080/api/skills/reload
```

No TypeScript changes needed.

### Evolve an existing skill

```bash
cp -r skills/lofi-dj/v1 skills/lofi-dj/v2
# Edit v2/rules.md — refine based on what works
# Edit v2/build-sequence.yml — add better examples
# The system auto-picks v2 on reload
```

### Change evolution timing

In `src/agent.ts`:
```typescript
const EVOLVE_INTERVAL = 60_000;  // change to 45_000, 90_000, etc.
const HUMAN_GRACE = 20_000;      // how long to wait after user edits
```

### Add a new WebSocket message type

1. Add the type to `src/types.ts` in `WsIncoming` / `WsOutgoing`
2. Handle it in `src/server.ts` switch statement
3. Handle it in `src/agent.ts` (export a new function)
4. Send/receive it in `web/index.html` JS

### Add audio analysis (future)

The browser has access to Strudel's audio output via Web Audio API. To add self-listening:

1. In `web/index.html`, tap into the audio context:
   ```javascript
   const analyser = audioContext.createAnalyser();
   // connect to Strudel's output node
   ```
2. Compute metrics (rhythm consistency, spectral balance) with Meyda.js
3. Send metrics to server via WebSocket: `{ type: 'audio_metrics', ... }`
4. Agent uses metrics to decide evolution quality

### Add persistence (Neon / Neo4j)

Currently everything is in-memory. To persist:

1. Add database client to `package.json`
2. Create `src/db.ts` with connection and queries
3. Store: session history, pattern ratings, skill evolution data
4. Neo4j graph model for skill → pattern → rating relationships

### Switch Strudel CDN version

In `web/index.html`, the script tag:
```html
<script src="https://unpkg.com/@strudel/web@latest"></script>
```
Pin to a specific version for stability:
```html
<script src="https://unpkg.com/@strudel/web@1.3.0"></script>
```

## Code Conventions

- **Async/await everywhere.** No callbacks, no `.then()` chains.
- **No frameworks.** Node http + ws library. Add Express only if needed.
- **Types in types.ts.** Don't scatter interfaces across files.
- **Skill logic in agent.ts.** The agent owns the lifecycle, prompts, evolution.
- **LLM calls in agent.ts via llm gateway.** Never call fetch to LLM directly.
- **Skills are data, not code.** Never hardcode genre rules in TypeScript.
- **Console.log with prefix.** `[ws]`, `[agent]`, `[skills]`, `[llm]` for easy filtering.

## Testing Tips

- **Test a skill quickly**: Edit `rules.md`, run `npm run reload-skills`, pick the skill in browser
- **Test LLM prompts**: The system prompt is built in `buildSystemPrompt()` in agent.ts — add a console.log to see it
- **Test without LLM**: Create a mock gateway in llm.ts that returns fixed Strudel code
- **Test WebSocket**: Use `wscat -c ws://localhost:8080/ws/agent` then send JSON manually

## Known Limitations / TODO

- [ ] No persistence — ratings and session history are lost on restart
- [ ] No audio self-analysis — agent can't hear what it generates
- [ ] No conversation history in LLM calls — each call is stateless
- [ ] Frontend is a single HTML file — consider Vite if it grows
- [ ] No auth — anyone can connect. Fine for 1-2 users.
- [ ] Evolution moves are a fixed list — should be dynamic based on current state
- [ ] No error recovery if Strudel eval fails in browser

## Environment

- **Node.js 20+** required (uses fetch, crypto.randomUUID)
- **npm** for package management
- **tsx** for running TypeScript directly (no compile step in dev)
- **tsc** for type checking: `npx tsc --noEmit`

## Cost Estimate

- Bootstrap: 6 LLM calls × ~$0.004 = ~$0.024
- Each evolution (60s): 1 call = ~$0.004
- Each human command: 1 call = ~$0.004
- 1-hour session: ~$0.30
- Use Ollama locally for free development
