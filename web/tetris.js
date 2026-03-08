// ═══════════════════════════════════════════════════
// Music Tetris — Vanilla JS Canvas
// Ported from phase2/music-tetris.jsx (React)
// ═══════════════════════════════════════════════════

const INSTRUMENTS = {
  kick:   { name: "KICK",   color: "#e84393", glow: "#fd79a8", shape: [[1,1],[1,1]], icon: "\u25C8" },
  hat:    { name: "HAT",    color: "#00cec9", glow: "#81ecec", shape: [[1,0],[1,0],[1,1]], icon: "\u26AC" },
  snare:  { name: "SNARE",  color: "#fdcb6e", glow: "#ffeaa7", shape: [[0,1,0],[1,1,1]], icon: "\u25C6" },
  bass:   { name: "BASS",   color: "#6c5ce7", glow: "#a29bfe", shape: [[1,1,1,1]], icon: "\u25AC" },
  chord:  { name: "CHORD",  color: "#e17055", glow: "#fab1a0", shape: [[0,1,1],[1,1,0]], icon: "\u2666" },
  melody: { name: "MELODY", color: "#00b894", glow: "#55efc4", shape: [[1,1,0],[0,1,1]], icon: "\u266A" },
  pad:    { name: "PAD",    color: "#0984e3", glow: "#74b9ff", shape: [[1,0],[1,1,1]], icon: "\u224B" },
};

const PIECE_KEYS = Object.keys(INSTRUMENTS);

function randThreshold() { return 3 + Math.floor(Math.random() * 3); }
const COLS = 10;
const ROWS = 20;
const CELL = 15;
const EMPTY = null;

// ═══════════════════════════════════════════════════
// Pure game logic (from React version)
// ═══════════════════════════════════════════════════

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(EMPTY));
}

function randomPieceKey() {
  return PIECE_KEYS[Math.floor(Math.random() * PIECE_KEYS.length)];
}

function makePiece(key) {
  const inst = INSTRUMENTS[key];
  return {
    key,
    shape: inst.shape.map(r => [...r]),
    color: inst.color,
    glow: inst.glow,
    icon: inst.icon,
    name: inst.name,
    row: 0,
    col: Math.floor(COLS / 2) - Math.floor(inst.shape[0].length / 2),
  };
}

function rotateCW(shape) {
  const rows = shape.length;
  const cols = Math.max(...shape.map(r => r.length));
  const padded = shape.map(r => {
    const p = [...r];
    while (p.length < cols) p.push(0);
    return p;
  });
  const rotated = [];
  for (let c = 0; c < cols; c++) {
    rotated.push([]);
    for (let r = rows - 1; r >= 0; r--) {
      rotated[c].push(padded[r][c]);
    }
  }
  return rotated;
}

function collides(board, piece, dr, dc, shape) {
  dr = dr || 0;
  dc = dc || 0;
  const s = shape || piece.shape;
  for (let r = 0; r < s.length; r++) {
    for (let c = 0; c < (s[r]?.length || 0); c++) {
      if (!s[r][c]) continue;
      const nr = piece.row + r + dr;
      const nc = piece.col + c + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return true;
      if (board[nr][nc] !== EMPTY) return true;
    }
  }
  return false;
}

function lockPiece(board, piece) {
  const newBoard = board.map(r => [...r]);
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < (piece.shape[r]?.length || 0); c++) {
      if (!piece.shape[r][c]) continue;
      const nr = piece.row + r;
      const nc = piece.col + c;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
        newBoard[nr][nc] = { color: piece.color, glow: piece.glow, icon: piece.icon, key: piece.key };
      }
    }
  }
  return newBoard;
}

function clearLines(board) {
  const cleared = [];
  const kept = [];
  for (let r = 0; r < ROWS; r++) {
    if (board[r].every(c => c !== EMPTY)) {
      cleared.push({ row: r, instruments: board[r].map(c => c.key) });
    } else {
      kept.push(board[r]);
    }
  }
  while (kept.length < ROWS) kept.unshift(Array(COLS).fill(EMPTY));
  return { board: kept, cleared };
}

function evaluateBoard(board) {
  let score = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] !== EMPTY) score -= (ROWS - r) * 2;
    }
  }
  for (let c = 0; c < COLS; c++) {
    let foundBlock = false;
    for (let r = 0; r < ROWS; r++) {
      if (board[r][c] !== EMPTY) foundBlock = true;
      else if (foundBlock) score -= 30;
    }
  }
  for (let r = 0; r < ROWS; r++) {
    if (board[r].every(cell => cell !== EMPTY)) score += 200;
  }
  for (let r = 0; r < ROWS; r++) {
    const filled = board[r].filter(c => c !== EMPTY);
    if (filled.length >= COLS - 2) {
      const unique = new Set(filled.map(c => c.key));
      score += unique.size * 10;
    }
  }
  return score;
}

function findBestMove(board, piece) {
  let bestScore = -Infinity;
  let bestCol = piece.col;
  let bestShape = piece.shape;

  const rotations = [piece.shape];
  let s = piece.shape;
  for (let i = 0; i < 3; i++) {
    s = rotateCW(s);
    rotations.push(s);
  }

  for (const shape of rotations) {
    const w = Math.max(...shape.map(r => r.length));
    for (let col = -1; col <= COLS - w + 1; col++) {
      const test = { ...piece, shape, col, row: 0 };
      if (collides(board, test, 0, 0, shape)) continue;
      let row = 0;
      while (!collides(board, { ...test, row: row + 1 }, 0, 0, shape)) row++;
      const locked = lockPiece(board, { ...test, row });
      const { board: afterClear } = clearLines(locked);
      const sc = evaluateBoard(afterClear);
      if (sc > bestScore) {
        bestScore = sc;
        bestCol = col;
        bestShape = shape;
      }
    }
  }
  return { col: bestCol, shape: bestShape };
}

// ═══════════════════════════════════════════════════
// MusicTetris class — canvas renderer + game loop
// ═══════════════════════════════════════════════════

class MusicTetris {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Object} opts
   * @param {function} opts.onPieceLand - (constraints) => void
   * @param {function} opts.onGameOver - () => void
   * @param {function} opts.onConstraintsChange - (constraints) => void
   * @param {number} opts.speedMs - initial fall speed (default 600)
   * @param {boolean} opts.autoReset - auto-restart on game over (default true)
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onPieceLand = opts.onPieceLand || (() => {});
    this.onGameOver = opts.onGameOver || (() => {});
    this.onConstraintsChange = opts.onConstraintsChange || (() => {});
    this.onCombo = opts.onCombo || (() => {});
    this.speedMs = opts.speedMs || 600;
    this.autoReset = opts.autoReset !== undefined ? opts.autoReset : true;

    // Game state
    this.board = createBoard();
    this.current = null;
    this.next = null;
    this.gameOver = false;
    this.score = 0;
    this.lines = 0;
    this.comboCount = 0;
    this.comboThreshold = randThreshold();
    this.timer = null;
    this.running = false;

    // Combo
    this._fixedThreshold = null; // if set, overrides random threshold

    // External control
    this._nextPieceKey = null;   // server-set next piece
    this._spawnQueue = [];       // user-requested pieces to spawn

    // Canvas sizing: board + next preview + legend
    this._boardW = COLS * CELL;
    this._boardH = ROWS * CELL;
    this._previewX = this._boardW + 12;
    this._previewW = 5 * CELL;
    this._totalW = this._previewX + this._previewW + 10;
    this._totalH = this._boardH;
    canvas.width = this._totalW;
    canvas.height = this._totalH;
    canvas.style.width = this._totalW + 'px';
    canvas.style.height = this._totalH + 'px';

    // Message overlay
    this._message = null;
    this._messageTimer = null;
  }

  start() {
    this.board = createBoard();
    this.score = 0;
    this.lines = 0;
    this.gameOver = false;
    this.current = this._makeNextPiece();
    this.next = this._makeNextPiece();
    this._applyAiMove();
    this.running = true;
    this._scheduleLoop();
    this._render();
  }

  stop() {
    this.running = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  restart() {
    this.stop();
    this.comboCount = 0;
    this.comboThreshold = this._fixedThreshold || randThreshold();
    this.start();
  }

  destroy() {
    this.stop();
    if (this._messageTimer) clearTimeout(this._messageTimer);
  }

  setAutoReset(val) { this.autoReset = !!val; }
  setSpeed(ms) { this.speedMs = Math.max(100, Math.min(10000, ms)); }
  setComboThreshold(n) { this.comboThreshold = n; this._fixedThreshold = n; }

  /** Server tells which piece to use next (Neo4j prediction) */
  setNextPiece(key) {
    if (INSTRUMENTS[key]) this._nextPieceKey = key;
  }

  /** User command: queue a specific piece to spawn next */
  spawnPiece(key) {
    if (INSTRUMENTS[key]) this._spawnQueue.push(key);
  }

  /** User command: remove all cells of a voice type from the board */
  removeVoice(voiceName) {
    let removed = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.board[r][c] && this.board[r][c].key === voiceName) {
          this.board[r][c] = EMPTY;
          removed++;
        }
      }
    }
    if (removed > 0) {
      // Compact: drop floating cells down (gravity)
      this._applyGravity();
      const constraints = this.getConstraints();
      this.onConstraintsChange(constraints);
      this.onPieceLand(constraints);
      this._render();
    }
  }

  /** Get current board constraints */
  getConstraints() {
    const voices = {};
    for (const row of this.board) {
      for (const cell of row) {
        if (cell && cell.key) {
          voices[cell.key] = (voices[cell.key] || 0) + 1;
        }
      }
    }
    const activeVoices = Object.keys(voices).filter(k => voices[k] > 0);
    const totalCells = Object.values(voices).reduce((a, b) => a + b, 0);
    return { voices, totalCells, activeVoices };
  }

  // ─── Internal ──────────────────────────────────

  _makeNextPiece() {
    // Priority: spawn queue > server-set next > random
    let key;
    if (this._spawnQueue.length > 0) {
      key = this._spawnQueue.shift();
    } else if (this._nextPieceKey) {
      key = this._nextPieceKey;
      this._nextPieceKey = null;
    } else {
      key = randomPieceKey();
    }
    return makePiece(key);
  }

  _applyAiMove() {
    if (!this.current) return;
    const { col, shape } = findBestMove(this.board, this.current);
    this.current.shape = shape;
    this.current.col = col;
  }

  _scheduleLoop() {
    if (!this.running) return;
    this.timer = setTimeout(() => this._tick(), this.speedMs);
  }

  _tick() {
    if (!this.running || this.gameOver) return;

    if (collides(this.board, this.current, 1)) {
      // Lock piece
      this.board = lockPiece(this.board, this.current);
      const { board: newBoard, cleared } = clearLines(this.board);
      this.board = newBoard;
      this.lines += cleared.length;
      if (cleared.length > 0) {
        this.comboCount += cleared.length;
        if (this.comboCount >= this.comboThreshold) {
          this.onCombo(this.comboCount);
          this.comboCount = 0;
          this.comboThreshold = this._fixedThreshold || randThreshold();
        }
        const allInst = new Set(cleared.flatMap(c => c.instruments.filter(Boolean)));
        const names = [...allInst].map(k => INSTRUMENTS[k]?.name).filter(Boolean);
        if (cleared.length >= 4) this._showMessage('TETRIS! ' + names.join(' + '));
        else if (allInst.size >= 4) this._showMessage('FULL BAND! ' + names.join(' + '));
        else if (cleared.length >= 2) this._showMessage('DOUBLE CLEAR! ' + names.join(' + '));
        else this._showMessage('LINE CLEAR: ' + names.join(' + '));
      }

      // Emit constraints
      const constraints = this.getConstraints();
      this.onPieceLand(constraints);

      // Spawn next
      this.current = this.next;
      this.next = this._makeNextPiece();
      if (collides(this.board, this.current)) {
        this.gameOver = true;
        this._render();
        this.onGameOver();
        if (this.autoReset) {
          setTimeout(() => this.restart(), 1500);
        }
        return;
      }
      this._applyAiMove();
    } else {
      this.current.row++;
    }

    this._render();
    this._scheduleLoop();
  }

  _applyGravity() {
    // Column-based gravity: move cells down to fill gaps
    for (let c = 0; c < COLS; c++) {
      let writeRow = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (this.board[r][c] !== EMPTY) {
          if (r !== writeRow) {
            this.board[writeRow][c] = this.board[r][c];
            this.board[r][c] = EMPTY;
          }
          writeRow--;
        }
      }
    }
  }

  _showMessage(msg) {
    this._message = msg;
    if (this._messageTimer) clearTimeout(this._messageTimer);
    this._messageTimer = setTimeout(() => { this._message = null; this._render(); }, 2500);
  }

  // ─── Rendering ─────────────────────────────────

  _render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, this._boardW, this._boardH);

    // Board cells
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = this.board[r][c];
        const x = c * CELL;
        const y = r * CELL;
        if (cell) {
          ctx.fillStyle = cell.color;
          ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
        } else {
          ctx.fillStyle = (r + c) % 2 === 0 ? '#0c0c16' : '#0a0a12';
          ctx.fillRect(x, y, CELL, CELL);
        }
      }
    }

    // Ghost piece
    if (this.current && !this.gameOver) {
      let ghostRow = this.current.row;
      while (!collides(this.board, { ...this.current, row: ghostRow + 1 })) ghostRow++;
      if (ghostRow > this.current.row) {
        ctx.globalAlpha = 0.15;
        for (let r = 0; r < this.current.shape.length; r++) {
          for (let c = 0; c < (this.current.shape[r]?.length || 0); c++) {
            if (!this.current.shape[r][c]) continue;
            const x = (this.current.col + c) * CELL;
            const y = (ghostRow + r) * CELL;
            ctx.fillStyle = this.current.color;
            ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
          }
        }
        ctx.globalAlpha = 1;
      }

      // Active piece
      for (let r = 0; r < this.current.shape.length; r++) {
        for (let c = 0; c < (this.current.shape[r]?.length || 0); c++) {
          if (!this.current.shape[r][c]) continue;
          const x = (this.current.col + c) * CELL;
          const y = (this.current.row + r) * CELL;
          ctx.fillStyle = this.current.color;
          ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
        }
      }
    }

    // Board border
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, this._boardW, this._boardH);

    // Next piece preview
    this._renderPreview(ctx);

    // Legend
    this._renderLegend(ctx);

    // Message overlay
    if (this._message) {
      ctx.fillStyle = '#4ade80';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this._message, this._boardW / 2, 14);
      ctx.textAlign = 'left';
    }

    // Game over overlay
    if (this.gameOver) {
      ctx.fillStyle = 'rgba(8,8,14,0.8)';
      ctx.fillRect(0, 0, this._boardW, this._boardH);
      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('MIX OVERFLOW', this._boardW / 2, this._boardH / 2 - 8);
      ctx.fillStyle = '#888';
      ctx.font = '10px monospace';
      ctx.fillText(this.autoReset ? 'Auto-restarting...' : 'Click reset', this._boardW / 2, this._boardH / 2 + 10);
      ctx.textAlign = 'left';
    }
  }

  _renderPreview(ctx) {
    const x0 = this._previewX;
    const y0 = 4;
    ctx.fillStyle = '#555';
    ctx.font = '9px monospace';
    ctx.fillText('NEXT', x0, y0 + 8);

    if (!this.next) return;
    const previewY = y0 + 14;
    ctx.fillStyle = '#0c0c16';
    ctx.fillRect(x0, previewY, this._previewW, 4 * CELL + 8);
    ctx.strokeStyle = '#1a1a2e';
    ctx.strokeRect(x0, previewY, this._previewW, 4 * CELL + 8);

    for (let r = 0; r < this.next.shape.length; r++) {
      for (let c = 0; c < (this.next.shape[r]?.length || 0); c++) {
        if (!this.next.shape[r][c]) continue;
        ctx.fillStyle = this.next.color;
        ctx.fillRect(x0 + 8 + c * CELL, previewY + 8 + r * CELL, CELL - 2, CELL - 2);
      }
    }
    ctx.fillStyle = this.next.color;
    ctx.font = '9px monospace';
    ctx.fillText(this.next.name, x0 + 8, previewY + 4 * CELL + 18);
  }

  _renderLegend(ctx) {
    const x0 = this._previewX;
    let y = 110;
    ctx.fillStyle = '#555';
    ctx.font = '8px monospace';
    ctx.fillText('VOICES', x0, y);
    y += 12;

    const constraints = this.getConstraints();
    for (const key of PIECE_KEYS) {
      const inst = INSTRUMENTS[key];
      const count = constraints.voices[key] || 0;
      ctx.globalAlpha = count > 0 ? 1 : 0.3;
      ctx.fillStyle = inst.color;
      ctx.fillRect(x0, y, 10, 10);
      ctx.fillStyle = count > 0 ? '#ccc' : '#444';
      ctx.font = '9px monospace';
      ctx.fillText(inst.name, x0 + 14, y + 8);
      if (count > 0) {
        ctx.fillStyle = inst.color;
        ctx.fillText('\u00D7' + count, x0 + 56, y + 8);
      }
      ctx.globalAlpha = 1;
      y += 14;
    }

    // Score / lines
    y += 8;
    ctx.fillStyle = '#555';
    ctx.font = '8px monospace';
    ctx.fillText('LINES ' + this.lines, x0, y);
  }
}

// Export for use in index.html
window.MusicTetris = MusicTetris;
