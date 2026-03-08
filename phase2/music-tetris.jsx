import { useState, useEffect, useCallback, useRef } from "react";

// ═══════════════════════════════════════════════════
// INSTRUMENT PIECES — each Tetris shape = one instrument
// ═══════════════════════════════════════════════════

const INSTRUMENTS = {
  kick:   { name: "KICK",   color: "#e84393", glow: "#fd79a8", shape: [[1,1],[1,1]], icon: "◈" },
  hat:    { name: "HAT",    color: "#00cec9", glow: "#81ecec", shape: [[1,0],[1,0],[1,1]], icon: "⚬" },
  snare:  { name: "SNARE",  color: "#fdcb6e", glow: "#ffeaa7", shape: [[0,1,0],[1,1,1]], icon: "◆" },
  bass:   { name: "BASS",   color: "#6c5ce7", glow: "#a29bfe", shape: [[1,1,1,1]], icon: "▬" },
  chord:  { name: "CHORD",  color: "#e17055", glow: "#fab1a0", shape: [[0,1,1],[1,1,0]], icon: "♦" },
  melody: { name: "MELODY", color: "#00b894", glow: "#55efc4", shape: [[1,1,0],[0,1,1]], icon: "♪" },
  pad:    { name: "PAD",    color: "#0984e3", glow: "#74b9ff", shape: [[1,0],[1,1,1]], icon: "≋" },
};

const PIECE_KEYS = Object.keys(INSTRUMENTS);
const COLS = 10;
const ROWS = 20;
const TICK_MS = 600;
const EMPTY = null;

// ═══════════════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════════════

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(EMPTY));
}

function randomPiece() {
  const key = PIECE_KEYS[Math.floor(Math.random() * PIECE_KEYS.length)];
  const inst = INSTRUMENTS[key];
  return {
    key,
    shape: inst.shape,
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

function collides(board, piece, dr = 0, dc = 0, shape = null) {
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

// ═══════════════════════════════════════════════════
// SCORING — like Neo4j rewards
// ═══════════════════════════════════════════════════

function scoreClear(cleared) {
  if (cleared.length === 0) return { points: 0, message: null };

  // Unique instruments in cleared lines
  const allInst = new Set(cleared.flatMap(c => c.instruments.filter(Boolean)));
  const diversity = allInst.size;

  // Base points
  const basePoints = [0, 100, 300, 500, 800][Math.min(cleared.length, 4)];

  // Diversity bonus — more different instruments = better arrangement
  const diversityBonus = diversity * 25;

  // Combo names
  const names = [...allInst].map(k => INSTRUMENTS[k]?.name).filter(Boolean);
  let message = "";

  if (cleared.length >= 4) {
    message = `TETRIS! ${names.join(" + ")}`;
  } else if (diversity >= 4) {
    message = `FULL BAND! ${names.join(" + ")}`;
  } else if (cleared.length >= 2) {
    message = `DOUBLE CLEAR! ${names.join(" + ")}`;
  } else {
    message = `LINE CLEAR: ${names.join(" + ")}`;
  }

  return { points: basePoints + diversityBonus, message };
}

// ═══════════════════════════════════════════════════
// AI AGENT — simple heuristic for auto-play
// ═══════════════════════════════════════════════════

function evaluateBoard(board) {
  let score = 0;
  // Penalize height
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] !== EMPTY) {
        score -= (ROWS - r) * 2;
      }
    }
  }
  // Penalize holes
  for (let c = 0; c < COLS; c++) {
    let foundBlock = false;
    for (let r = 0; r < ROWS; r++) {
      if (board[r][c] !== EMPTY) foundBlock = true;
      else if (foundBlock) score -= 30;
    }
  }
  // Reward complete lines
  for (let r = 0; r < ROWS; r++) {
    if (board[r].every(cell => cell !== EMPTY)) score += 200;
  }
  // Reward instrument diversity in near-complete lines
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
      // Drop to bottom
      let row = 0;
      while (!collides(board, { ...test, row: row + 1 }, 0, 0, shape)) row++;
      const locked = lockPiece(board, { ...test, row });
      const { board: cleared } = clearLines(locked);
      const score = evaluateBoard(cleared);
      if (score > bestScore) {
        bestScore = score;
        bestCol = col;
        bestShape = shape;
      }
    }
  }
  return { col: bestCol, shape: bestShape };
}

// ═══════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════

export default function MusicTetris() {
  const [board, setBoard] = useState(createBoard);
  const [current, setCurrent] = useState(randomPiece);
  const [next, setNext] = useState(randomPiece);
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [level, setLevel] = useState(1);
  const [gameOver, setGameOver] = useState(false);
  const [paused, setPaused] = useState(false);
  const [aiMode, setAiMode] = useState(true);
  const [message, setMessage] = useState(null);
  const [clearingRows, setClearingRows] = useState([]);
  const [history, setHistory] = useState([]);
  const [evolveCount, setEvolveCount] = useState(0);
  const msgTimer = useRef(null);
  const aiMoveApplied = useRef(false);

  // Clear message after delay
  const showMessage = useCallback((msg) => {
    setMessage(msg);
    if (msgTimer.current) clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMessage(null), 2500);
  }, []);

  // AI move — rotate and position piece
  useEffect(() => {
    if (!aiMode || gameOver || paused || aiMoveApplied.current) return;
    const { col, shape } = findBestMove(board, current);
    setCurrent(prev => ({ ...prev, shape, col }));
    aiMoveApplied.current = true;
  }, [current, aiMode, board, gameOver, paused]);

  // Game tick
  useEffect(() => {
    if (gameOver || paused) return;
    const speed = Math.max(100, TICK_MS - (level - 1) * 50);
    const timer = setInterval(() => {
      setCurrent(prev => {
        if (collides(board, prev, 1)) {
          // Lock
          const locked = lockPiece(board, prev);
          const { board: newBoard, cleared } = clearLines(locked);

          if (cleared.length > 0) {
            setClearingRows(cleared.map(c => c.row));
            setTimeout(() => setClearingRows([]), 300);
          }

          const { points, message: msg } = scoreClear(cleared);

          setBoard(newBoard);
          setScore(s => s + points);
          setLines(l => {
            const newL = l + cleared.length;
            setLevel(Math.floor(newL / 10) + 1);
            return newL;
          });
          setEvolveCount(e => e + 1);

          if (msg) showMessage(msg);

          // Track history
          if (cleared.length > 0) {
            const instruments = [...new Set(cleared.flatMap(c => c.instruments.filter(Boolean)))];
            setHistory(h => [...h.slice(-19), {
              evolve: evolveCount + 1,
              lines: cleared.length,
              instruments: instruments.map(k => INSTRUMENTS[k]?.name),
              points,
            }]);
          }

          // Spawn next
          const np = next;
          if (collides(newBoard, { ...np, row: 0, col: Math.floor(COLS / 2) - 1 })) {
            setGameOver(true);
            return prev;
          }
          setNext(randomPiece());
          aiMoveApplied.current = false;
          return { ...np, row: 0, col: Math.floor(COLS / 2) - Math.floor(np.shape[0].length / 2) };
        }
        return { ...prev, row: prev.row + 1 };
      });
    }, speed);
    return () => clearInterval(timer);
  }, [board, level, gameOver, paused, next, showMessage, evolveCount]);

  // Keyboard controls
  useEffect(() => {
    if (aiMode) return;
    const handler = (e) => {
      if (gameOver) return;
      if (e.key === "ArrowLeft") {
        setCurrent(p => collides(board, p, 0, -1) ? p : { ...p, col: p.col - 1 });
      } else if (e.key === "ArrowRight") {
        setCurrent(p => collides(board, p, 0, 1) ? p : { ...p, col: p.col + 1 });
      } else if (e.key === "ArrowDown") {
        setCurrent(p => collides(board, p, 1) ? p : { ...p, row: p.row + 1 });
      } else if (e.key === "ArrowUp") {
        setCurrent(p => {
          const rotated = rotateCW(p.shape);
          return collides(board, p, 0, 0, rotated) ? p : { ...p, shape: rotated };
        });
      } else if (e.key === " ") {
        setCurrent(p => {
          let r = p.row;
          while (!collides(board, { ...p, row: r + 1 })) r++;
          return { ...p, row: r };
        });
      } else if (e.key === "p") {
        setPaused(v => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [board, gameOver, aiMode]);

  const restart = () => {
    setBoard(createBoard());
    const p = randomPiece();
    setCurrent(p);
    setNext(randomPiece());
    setScore(0);
    setLines(0);
    setLevel(1);
    setGameOver(false);
    setPaused(false);
    setMessage(null);
    setHistory([]);
    setEvolveCount(0);
    aiMoveApplied.current = false;
  };

  // Build display board with current piece
  const displayBoard = board.map(r => [...r]);
  if (current) {
    // Ghost piece
    let ghostRow = current.row;
    while (!collides(board, { ...current, row: ghostRow + 1 })) ghostRow++;
    for (let r = 0; r < current.shape.length; r++) {
      for (let c = 0; c < (current.shape[r]?.length || 0); c++) {
        if (!current.shape[r][c]) continue;
        const nr = ghostRow + r;
        const nc = current.col + c;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && displayBoard[nr][nc] === EMPTY) {
          displayBoard[nr][nc] = { color: current.color + "22", glow: "transparent", icon: "", ghost: true };
        }
      }
    }
    // Active piece
    for (let r = 0; r < current.shape.length; r++) {
      for (let c = 0; c < (current.shape[r]?.length || 0); c++) {
        if (!current.shape[r][c]) continue;
        const nr = current.row + r;
        const nc = current.col + c;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
          displayBoard[nr][nc] = { color: current.color, glow: current.glow, icon: current.icon, active: true };
        }
      }
    }
  }

  // Count instruments on board
  const boardInstruments = {};
  for (const row of board) {
    for (const cell of row) {
      if (cell && cell.key) {
        boardInstruments[cell.key] = (boardInstruments[cell.key] || 0) + 1;
      }
    }
  }

  const CELL = 28;

  return (
    <div style={{
      background: "#08080e",
      minHeight: "100vh",
      display: "flex",
      justifyContent: "center",
      alignItems: "flex-start",
      padding: "24px 16px",
      fontFamily: "'Courier New', monospace",
      color: "#e0e0ee",
    }}>
      <div style={{ display: "flex", gap: 24 }}>

        {/* LEFT PANEL — instrument legend + history */}
        <div style={{ width: 160 }}>
          <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>
            Instruments
          </div>
          {PIECE_KEYS.map(k => {
            const inst = INSTRUMENTS[k];
            const count = boardInstruments[k] || 0;
            return (
              <div key={k} style={{
                display: "flex", alignItems: "center", gap: 8,
                marginBottom: 6, opacity: count > 0 ? 1 : 0.35,
              }}>
                <div style={{
                  width: 14, height: 14, borderRadius: 3,
                  background: inst.color,
                  boxShadow: count > 0 ? `0 0 8px ${inst.glow}44` : "none",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, color: "#000",
                }}>{inst.icon}</div>
                <span style={{ fontSize: 11, color: count > 0 ? "#ccc" : "#444" }}>
                  {inst.name}
                </span>
                {count > 0 && (
                  <span style={{ fontSize: 9, color: inst.color, marginLeft: "auto" }}>
                    ×{count}
                  </span>
                )}
              </div>
            );
          })}

          {/* Recent clears */}
          <div style={{
            fontSize: 10, color: "#555", textTransform: "uppercase",
            letterSpacing: 2, marginTop: 20, marginBottom: 8,
          }}>
            Clear Log
          </div>
          <div style={{ maxHeight: 200, overflow: "hidden" }}>
            {history.slice().reverse().map((h, i) => (
              <div key={i} style={{
                fontSize: 9, color: "#888", marginBottom: 4,
                borderLeft: `2px solid ${i === 0 ? "#4ade80" : "#222"}`,
                paddingLeft: 6,
                opacity: 1 - i * 0.12,
              }}>
                <span style={{ color: "#4ade80" }}>+{h.points}</span>{" "}
                {h.instruments.join("+")}
              </div>
            ))}
          </div>
        </div>

        {/* CENTER — game board */}
        <div>
          {/* Message bar */}
          <div style={{
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 8,
          }}>
            {message && (
              <div style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#4ade80",
                textShadow: "0 0 12px #4ade8066",
                animation: "fadeIn 0.2s ease",
              }}>
                {message}
              </div>
            )}
          </div>

          {/* Board */}
          <div style={{
            position: "relative",
            border: "2px solid #1a1a2e",
            borderRadius: 4,
            background: "#0a0a14",
            padding: 1,
            boxShadow: "0 0 40px #00000088, inset 0 0 60px #00000066",
          }}>
            {displayBoard.map((row, ri) => (
              <div key={ri} style={{ display: "flex" }}>
                {row.map((cell, ci) => {
                  const isClearing = clearingRows.includes(ri);
                  return (
                    <div key={ci} style={{
                      width: CELL,
                      height: CELL,
                      border: "1px solid #0f0f1a",
                      background: cell
                        ? cell.ghost
                          ? cell.color
                          : cell.color
                        : ri % 2 === ci % 2 ? "#0c0c16" : "#0a0a12",
                      boxShadow: cell && !cell.ghost
                        ? `inset 0 0 6px ${cell.glow}44, 0 0 4px ${cell.glow}22`
                        : "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      color: cell && !cell.ghost ? "#00000066" : "transparent",
                      transition: isClearing ? "all 0.2s" : "none",
                      opacity: isClearing ? 0 : 1,
                      transform: isClearing ? "scaleY(0)" : "scaleY(1)",
                    }}>
                      {cell && !cell.ghost ? cell.icon : ""}
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Game over overlay */}
            {gameOver && (
              <div style={{
                position: "absolute",
                inset: 0,
                background: "#08080ecc",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 4,
              }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#f87171", marginBottom: 4 }}>
                  MIX OVERFLOW
                </div>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 16 }}>
                  Too many instruments stacked
                </div>
                <button onClick={restart} style={{
                  background: "#7c5cfc",
                  color: "#fff",
                  border: "none",
                  padding: "8px 20px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 12,
                }}>New Session</button>
              </div>
            )}
          </div>

          {/* Controls */}
          <div style={{
            display: "flex",
            justifyContent: "center",
            gap: 8,
            marginTop: 12,
          }}>
            <button onClick={() => { setAiMode(!aiMode); aiMoveApplied.current = false; }} style={{
              background: aiMode ? "#00b89422" : "#1a1a25",
              border: `1px solid ${aiMode ? "#00b894" : "#2a2a3a"}`,
              color: aiMode ? "#00b894" : "#888",
              padding: "5px 14px",
              borderRadius: 6,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 11,
            }}>
              {aiMode ? "AI ●" : "AI ○"}
            </button>
            <button onClick={() => setPaused(!paused)} style={{
              background: "#1a1a25",
              border: "1px solid #2a2a3a",
              color: "#888",
              padding: "5px 14px",
              borderRadius: 6,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 11,
            }}>
              {paused ? "▶ Resume" : "⏸ Pause"}
            </button>
            <button onClick={restart} style={{
              background: "#1a1a25",
              border: "1px solid #2a2a3a",
              color: "#888",
              padding: "5px 14px",
              borderRadius: 6,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 11,
            }}>↺ Reset</button>
          </div>
        </div>

        {/* RIGHT PANEL — score, next, stats */}
        <div style={{ width: 160 }}>
          {/* Next piece */}
          <div style={{
            fontSize: 10, color: "#555", textTransform: "uppercase",
            letterSpacing: 2, marginBottom: 8,
          }}>Next</div>
          <div style={{
            background: "#0c0c16",
            border: "1px solid #1a1a2e",
            borderRadius: 6,
            padding: 12,
            marginBottom: 16,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}>
            <div style={{ marginBottom: 4 }}>
              {next.shape.map((row, ri) => (
                <div key={ri} style={{ display: "flex" }}>
                  {row.map((cell, ci) => (
                    <div key={ci} style={{
                      width: 18,
                      height: 18,
                      background: cell ? next.color : "transparent",
                      borderRadius: 2,
                      margin: 1,
                      boxShadow: cell ? `0 0 6px ${next.glow}44` : "none",
                    }} />
                  ))}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10, color: next.color, fontWeight: 600 }}>
              {next.name}
            </div>
          </div>

          {/* Stats */}
          <div style={{ marginBottom: 16 }}>
            <StatRow label="SCORE" value={score.toLocaleString()} color="#ffeaa7" />
            <StatRow label="LINES" value={lines} color="#4ade80" />
            <StatRow label="LEVEL" value={level} color="#7c5cfc" />
            <StatRow label="EVOLVES" value={evolveCount} color="#00cec9" />
          </div>

          {/* Density meter */}
          <div style={{
            fontSize: 10, color: "#555", textTransform: "uppercase",
            letterSpacing: 2, marginBottom: 8,
          }}>Mix Density</div>
          <DensityMeter board={board} />

          {/* Mode indicator */}
          <div style={{
            marginTop: 16,
            padding: "8px 10px",
            background: aiMode ? "#00b89411" : "#7c5cfc11",
            border: `1px solid ${aiMode ? "#00b89433" : "#7c5cfc33"}`,
            borderRadius: 6,
            fontSize: 10,
            color: aiMode ? "#00b894" : "#7c5cfc",
            textAlign: "center",
          }}>
            {aiMode ? "AI Agent Playing" : "Manual Mode"}
            {!aiMode && (
              <div style={{ fontSize: 9, color: "#555", marginTop: 4 }}>
                ← → ↓ rotate:↑ drop:space
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value, color }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      marginBottom: 6,
    }}>
      <span style={{ fontSize: 10, color: "#555", letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </div>
  );
}

function DensityMeter({ board }) {
  let filled = 0;
  let total = ROWS * COLS;
  for (const row of board) {
    for (const cell of row) {
      if (cell !== EMPTY) filled++;
    }
  }
  const pct = (filled / total) * 100;
  const danger = pct > 60;
  const warning = pct > 40;
  const color = danger ? "#f87171" : warning ? "#fbbf24" : "#4ade80";

  return (
    <div>
      <div style={{
        height: 6,
        background: "#1a1a25",
        borderRadius: 3,
        overflow: "hidden",
        marginBottom: 4,
      }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          background: color,
          borderRadius: 3,
          transition: "width 0.3s, background 0.3s",
          boxShadow: danger ? `0 0 8px ${color}44` : "none",
        }} />
      </div>
      <div style={{ fontSize: 10, color, textAlign: "right" }}>
        {pct.toFixed(0)}%
        {danger && " ⚠ OVERFLOW RISK"}
        {!danger && warning && " △ GETTING DENSE"}
      </div>
    </div>
  );
}
