import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { createLlm } from './llm.js';
import { loadSkills, allSkills, getSkill, skillVersions } from './skills.js';
import { startSession, stopSession, onSelectSkill, onCommand, onCodeEdit, onRate, onSetEvolveInterval, onEvolveNow, onToggleEvolve, onTetrisState, onTetrisRestart, onCombo, onTetrisRandomSpeed } from './agent.js';
import { connectNeon, disconnectNeon } from './db/neon.js';
import { connectNeo4j, disconnectNeo4j, setupSchema as setupNeo4jSchema, getGraphStats } from './db/neo4j.js';
import { runAnalysis, getAnalysisStatus } from './db/analysis.js';
import { runMergeReview, runFullReview, getReviewStatus } from './db/review.js';
import type { WsIncoming, WsOutgoing } from './types.js';

// ─── Config ───────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '8080');
const SKILLS_PATH = process.env.SKILLS_PATH ?? './skills';

// ─── Init ─────────────────────────────────────────

const llm = createLlm({
  provider: process.env.LLM_PROVIDER ?? 'anthropic',
  apiKey: process.env.LLM_API_KEY ?? '',
  model: process.env.LLM_MODEL ?? 'claude-sonnet-4-5-20250929',
  baseUrl: process.env.LLM_BASE_URL ?? '',
});

loadSkills(SKILLS_PATH);
await connectNeon();
await connectNeo4j();
if ((await import('./db/neo4j.js')).isConnected()) {
  await setupNeo4jSchema();
}

// ─── Graceful shutdown ───────────────────────────
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, async () => {
    console.log(`\n[server] ${sig} received, shutting down...`);
    await disconnectNeo4j();
    await disconnectNeon();
    process.exit(0);
  });
}

// ─── HTTP Server (for REST API + static files) ────

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // REST API
  if (url.pathname === '/api/skills' && req.method === 'GET') {
    const data = allSkills().map(s => ({
      id: s.id, name: s.name, icon: s.icon, version: s.version,
      description: s.description, tags: s.tags, steps: s.buildSequence.length,
    }));
    json(res, data);
    return;
  }

  if (url.pathname.startsWith('/api/skills/') && req.method === 'GET') {
    const id = url.pathname.split('/')[3];
    const skill = getSkill(id);
    if (!skill) { res.writeHead(404); res.end('Not found'); return; }
    json(res, {
      ...skill,
      versions: skillVersions(id, SKILLS_PATH),
    });
    return;
  }

  if (url.pathname === '/api/skills/reload' && req.method === 'POST') {
    loadSkills(SKILLS_PATH);
    json(res, {
      reloaded: true, count: allSkills().length,
      skills: allSkills().map(s => `${s.id} v${s.version}`),
    });
    return;
  }

  // Analysis pipeline endpoints
  if (url.pathname === '/api/analysis/run' && req.method === 'POST') {
    runAnalysis().then(result => json(res, result)).catch(e => {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    });
    return;
  }

  if (url.pathname === '/api/analysis/status' && req.method === 'GET') {
    getAnalysisStatus().then(result => json(res, result)).catch(e => {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    });
    return;
  }

  // LLM Review endpoints
  if (url.pathname === '/api/review/merge' && req.method === 'POST') {
    const skill = url.searchParams.get('skill') ?? undefined;
    runMergeReview(skill).then(result => json(res, result)).catch(e => {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    });
    return;
  }

  if (url.pathname === '/api/review/full' && req.method === 'POST') {
    const skill = url.searchParams.get('skill') ?? undefined;
    runFullReview(skill).then(result => json(res, result)).catch(e => {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    });
    return;
  }

  if (url.pathname === '/api/review/status' && req.method === 'GET') {
    json(res, getReviewStatus());
    return;
  }

  if (url.pathname === '/api/graph/stats' && req.method === 'GET') {
    getGraphStats().then(result => json(res, result)).catch(e => {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    });
    return;
  }

  // Static files from web/
  serveStatic(req, res, url);
});

// ─── WebSocket Server ─────────────────────────────

const wss = new WebSocketServer({ server, path: '/ws/agent' });

wss.on('connection', (ws: WebSocket) => {
  const id = crypto.randomUUID();
  console.log(`[ws] connected: ${id}`);

  const send = (msg: WsOutgoing) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  };

  startSession(id, send);

  ws.on('message', (raw: Buffer) => {
    try {
      const msg: WsIncoming = JSON.parse(raw.toString());

      switch (msg.type) {
        case 'select_skill':
          if (msg.skillId) onSelectSkill(id, msg.skillId, llm);
          break;
        case 'command':
          if (msg.command) onCommand(id, msg.command, msg.currentCode, llm);
          break;
        case 'code_edit':
          if (msg.currentCode) onCodeEdit(id, msg.currentCode);
          break;
        case 'rate':
          onRate(id, msg.rating ?? 3, msg.voiceName);
          break;
        case 'set_evolve_interval':
          if (msg.interval) onSetEvolveInterval(id, msg.interval);
          break;
        case 'evolve_now':
          onEvolveNow(id, llm);
          break;
        case 'toggle_evolve':
          onToggleEvolve(id, msg.enabled ?? false, llm);
          break;
        case 'tetris_state':
          if (msg.constraints) onTetrisState(id, msg.constraints, llm);
          break;
        case 'tetris_restart':
          onTetrisRestart(id, llm);
          break;
        case 'tetris_combo':
          if (msg.comboCount) onCombo(id, msg.comboCount, llm);
          break;
        case 'tetris_random_speed':
          onTetrisRandomSpeed(id, msg.enabled ?? false);
          break;
        case 'stop':
          stopSession(id);
          break;
      }
    } catch (e: any) {
      console.error('[ws] message error:', e.message);
    }
  });

  ws.on('close', () => {
    console.log(`[ws] disconnected: ${id}`);
    stopSession(id);
  });
});

// ─── Static file server ───────────────────────────

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, url: URL): void {
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  filePath = path.join('web', filePath);

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = path.extname(filePath);
  const mimeTypes: Record<string, string> = {
    '.html': 'text/html', '.js': 'text/javascript',
    '.css': 'text/css', '.json': 'application/json',
    '.mp3': 'audio/mpeg',
  };

  res.setHeader('Content-Type', mimeTypes[ext] ?? 'application/octet-stream');
  res.writeHead(200);
  fs.createReadStream(filePath).pipe(res);
}

function json(res: http.ServerResponse, data: any): void {
  res.setHeader('Content-Type', 'application/json');
  res.writeHead(200);
  res.end(JSON.stringify(data, null, 2));
}

// ─── Start ────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`
  ┌─────────────────────────────────────┐
  │  🎵 Ambient Lo-fi                   │
  │  AI Music Copilot                   │
  │                                     │
  │  http://localhost:${PORT}              │
  │  ws://localhost:${PORT}/ws/agent       │
  │                                     │
  │  LLM: ${llm.provider.padEnd(28)}  │
  │  Skills: ${String(allSkills().length).padEnd(26)}  │
  └─────────────────────────────────────┘
  `);
});
