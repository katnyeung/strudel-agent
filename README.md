# Strudel Agent — AI Music Copilot

An AI-powered live coding music copilot that generates, evolves, and performs music in your browser using [Strudel](https://strudel.cc). Pick a genre, drop Tetris pieces to add instruments, and steer the music with natural language — the AI handles the rest.

## Demo

Select a skill (genre) → Tetris pieces fall → each piece adds an instrument → the AI generates matching Strudel code → music plays and evolves in real time.

```
Browser                        Server                    LLM
┌─────────────────────┐       ┌──────────────┐       ┌──────────┐
│ Strudel REPL        │◄─ws─►│ agent.ts      │──────►│ Claude   │
│ Music Tetris        │       │ skills loader │       │ Gemini   │
│ Copilot Chat        │       │ LLM gateway   │       │ Ollama   │
└─────────────────────┘       └──────────────┘       └──────────┘
```

## Quick Start

```bash
cp .env.example .env    # configure your LLM provider + API key
npm install
npm run dev             # http://localhost:8080
```

Open the browser, pick a skill, and play. That's it.

## How It Works

### Music Tetris

The Tetris board controls which instruments are active. Each piece type maps to a voice:

| Piece | Voice | Role |
|-------|-------|------|
| KICK | `$kick:` | Bass drum |
| HAT | `$hat:` | Hi-hats |
| SNARE | `$snare:` | Snare / rim |
| BASS | `$bass:` | Bass line |
| CHORD | `$chord:` | Chords / piano |
| MELODY | `$melody:` | Melodic line |
| PAD | `$pad:` | Pad / texture |

More cells on the board = denser patterns. When pieces clear (combo), the system generates a vocal sample that gets woven into the music.

### Skills (Genres)

Skills are text files that define a musical style — no code required:

| Skill | Style |
|-------|-------|
| **Lo-fi DJ** `v2` | Cafe piano lo-fi. Warm Rhodes chords lead, gentle drums underneath. Nujabes, Jinsang vibes. |
| **Minimal Techno** | Hypnotic four-on-the-floor, sparse elements, filter sweeps. Tension through repetition. |
| **Ambient Drift** | Generative textures, spacious. Brian Eno-inspired landscapes that breathe and shift. |
| **Jazz Improv** | Walking bass, ii-V-I progressions, swing. Small combo jazz — piano trio feel. |
| **Soul Keys** | Rhodes, gospel chords, warm groove. Neo-soul with rich voicings and Sunday morning feel. |

Each skill contains:
- `meta.yml` — name, tempo range, tags
- `rules.md` — genre rules as a creative brief
- `build-sequence.yml` — step-by-step build examples with Strudel code

### Natural Language Control

Type commands in the chat to steer the music:
- *"make it dreamier"* — modifies chords, adds reverb
- *"add melody"* — spawns a melody Tetris piece
- *"remove kick"* — clears kick cells from the board
- *"more swing"* — adjusts groove feel

## LLM Providers

Provider-agnostic. Set via `.env`:

| Provider | Config |
|----------|--------|
| **Gemini** | `LLM_PROVIDER=gemini` `LLM_MODEL=gemini-2.0-flash` |
| **Claude** | `LLM_PROVIDER=anthropic` `LLM_MODEL=claude-sonnet-4-5-20250929` |
| **Ollama** (local) | `LLM_PROVIDER=ollama` `LLM_MODEL=qwen3.5:9b` `LLM_BASE_URL=http://localhost:11434` |
| **OpenRouter** | `LLM_PROVIDER=openrouter` `LLM_MODEL=...` |
| **xAI** | `LLM_PROVIDER=xai` `LLM_MODEL=grok-...` |

## Optional Integrations

| Service | Purpose | Required? |
|---------|---------|-----------|
| **Neon** (Postgres) | Event logging — sessions, evolutions, ratings, commands | Optional |
| **Neo4j Aura** | Graph memory — learns which voice combinations work best | Optional |
| **ElevenLabs** | TTS vocals — combo Tetris clears generate spoken phrases | Optional |

## Project Structure

```
src/
  agent.ts          # Copilot brain: bootstrap, evolve, respond
  server.ts         # HTTP + WebSocket server
  llm.ts            # LLM gateway (multi-provider)
  skills.ts         # Skill loader (YAML/MD from filesystem)
  types.ts          # TypeScript interfaces
  vocal.ts          # ElevenLabs TTS integration
  db/               # Neon + Neo4j integrations

web/
  index.html        # Frontend: Strudel REPL + copilot panel
  tetris.js         # Music Tetris game engine

skills/
  _base/            # Shared Strudel knowledge (loaded into every prompt)
  lofi-dj/v2/       # Lo-fi DJ skill (cafe piano)
  minimal-techno/v1/
  ambient-drift/v1/
  jazz-improv/v1/
  soul-keys/v1/
```

## Adding a New Skill

```bash
mkdir -p skills/drum-and-bass/v1
# Create meta.yml, rules.md, build-sequence.yml
# See skills/lofi-dj/v2/ as a template
curl -X POST http://localhost:8080/api/skills/reload
```

No TypeScript changes needed. Skills are data, not code.

## Cost

Using cloud LLMs:
- Bootstrap: 1 LLM call ~$0.004
- Each Tetris regeneration: 1 call ~$0.004
- Each chat command: 1 call ~$0.004
- 1-hour session: ~$0.20-0.40

Use Ollama locally for free development.

## Tech Stack

- **Runtime**: Node.js 20+ with tsx (no compile step)
- **Audio**: [Strudel](https://strudel.cc) (Web Audio API, runs in browser)
- **Transport**: WebSocket (JSON protocol)
- **Frontend**: Vanilla HTML/JS (no framework)
- **Backend**: ~1300 lines TypeScript

## License

See [THIRD_PARTY_LICENSES](./THIRD_PARTY_LICENSES) for dependency licenses.
