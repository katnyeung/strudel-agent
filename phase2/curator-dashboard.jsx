import { useState, useEffect, useRef } from "react";

// ─── Mock data for demonstration ──────────────────
const MOCK_SCORECARD = {
  skill_id: "lofi-dj",
  version: 3,
  composite_score: 72.4,
  status: "improving",
  delta: 8.2,
  confidence: 0.78,
  metrics: {
    avg_rating: 3.8,
    avg_play_secs: 185,
    human_override_rate: 0.12,
    skip_rate: 0.08,
    rating_trend: 0.35,
    high_rate: 0.42,
    low_rate: 0.11,
  },
  golden_count: 3,
  avoid_count: 1,
};

const MOCK_HISTORY = [
  { version: 1, score: 52.1, status: "new", evolutions: 1440 },
  { version: 2, score: 64.2, status: "improving", evolutions: 1380 },
  { version: 3, score: 72.4, status: "improving", evolutions: 890 },
];

const MOCK_REWARDS = [
  { id: "1", type: "golden", note: "Perfect lazy groove — kick + ghost snare + filtered chords", weight: 9, created: "2d ago" },
  { id: "2", type: "direction", note: "More swing, less busy hi-hats", weight: 7, created: "5d ago" },
  { id: "3", type: "boundary", note: "Never more than 5 voices at once", weight: 10, created: "7d ago" },
  { id: "4", type: "avoid", note: "Too many filter sweeps stacked — sounds washy", weight: 6, created: "3d ago" },
];

const STATUS_COLORS = {
  improving: "#4ade80",
  stable: "#fbbf24",
  degrading: "#f87171",
  insufficient: "#666",
  new: "#818cf8",
};

const REWARD_ICONS = {
  golden: "★",
  avoid: "✕",
  direction: "→",
  boundary: "▮",
};

const REWARD_COLORS = {
  golden: { bg: "#422006", border: "#ca8a04", text: "#fde68a" },
  avoid: { bg: "#350a0a", border: "#dc2626", text: "#fca5a5" },
  direction: { bg: "#0c1a3a", border: "#3b82f6", text: "#93c5fd" },
  boundary: { bg: "#1a0a2e", border: "#8b5cf6", text: "#c4b5fd" },
};

export default function CuratorDashboard() {
  const [activeTab, setActiveTab] = useState("scorecard");
  const [scorecard, setScorecard] = useState(MOCK_SCORECARD);
  const [history, setHistory] = useState(MOCK_HISTORY);
  const [rewards, setRewards] = useState(MOCK_REWARDS);
  const [newReward, setNewReward] = useState({ type: "direction", note: "", weight: 5 });
  const [showRollback, setShowRollback] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState(2);
  const canvasRef = useRef(null);

  // Draw score history chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || activeTab !== "scorecard") return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width = canvas.offsetWidth * 2;
    const h = canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    const cw = w / 2;
    const ch = h / 2;

    ctx.clearRect(0, 0, cw, ch);

    // Grid
    ctx.strokeStyle = "#1e1e2e";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = 20 + (i / 4) * (ch - 40);
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(cw - 20, y);
      ctx.stroke();
      ctx.fillStyle = "#555";
      ctx.font = "10px monospace";
      ctx.fillText(`${100 - i * 25}`, 8, y + 4);
    }

    if (history.length < 2) return;

    // Line
    const xStep = (cw - 80) / (history.length - 1);
    ctx.beginPath();
    ctx.strokeStyle = "#7c5cfc";
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    history.forEach((h, i) => {
      const x = 50 + i * xStep;
      const y = 20 + ((100 - h.score) / 100) * (ch - 40);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Dots + labels
    history.forEach((h, i) => {
      const x = 50 + i * xStep;
      const y = 20 + ((100 - h.score) / 100) * (ch - 40);

      // Glow
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = STATUS_COLORS[h.status] || "#7c5cfc";
      ctx.globalAlpha = 0.3;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Dot
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = STATUS_COLORS[h.status] || "#7c5cfc";
      ctx.fill();

      // Label
      ctx.fillStyle = "#aaa";
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`v${h.version}`, x, ch - 6);
      ctx.fillStyle = "#ddd";
      ctx.fillText(h.score.toFixed(1), x, y - 10);
    });
  }, [history, activeTab]);

  const addReward = () => {
    if (!newReward.note.trim()) return;
    const r = {
      id: Date.now().toString(),
      type: newReward.type,
      note: newReward.note,
      weight: newReward.weight,
      created: "now",
    };
    setRewards([r, ...rewards]);
    setNewReward({ type: "direction", note: "", weight: 5 });
  };

  const removeReward = (id) => {
    setRewards(rewards.filter(r => r.id !== id));
  };

  const doRollback = () => {
    setHistory(history.filter(h => h.version <= rollbackTarget));
    setScorecard({ ...scorecard, version: rollbackTarget });
    setShowRollback(false);
  };

  return (
    <div style={{
      background: "#0a0a0f",
      color: "#e0e0ee",
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      minHeight: "100vh",
      padding: "24px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#7c5cfc", margin: 0 }}>
          Curator Dashboard
        </h1>
        <span style={{ fontSize: 12, color: "#888" }}>
          {scorecard.skill_id} v{scorecard.version}
        </span>
        <span style={{
          fontSize: 11,
          padding: "2px 10px",
          borderRadius: 20,
          background: STATUS_COLORS[scorecard.status] + "22",
          color: STATUS_COLORS[scorecard.status],
          border: `1px solid ${STATUS_COLORS[scorecard.status]}44`,
        }}>
          {scorecard.status}
        </span>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {["scorecard", "rewards", "rollback"].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            background: activeTab === tab ? "#7c5cfc" : "#12121a",
            color: activeTab === tab ? "#fff" : "#888",
            border: `1px solid ${activeTab === tab ? "#7c5cfc" : "#2a2a3a"}`,
            padding: "6px 16px",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 12,
            fontFamily: "inherit",
            textTransform: "capitalize",
          }}>{tab}</button>
        ))}
      </div>

      {/* ═══ SCORECARD TAB ═══ */}
      {activeTab === "scorecard" && (
        <div>
          {/* Big Score */}
          <div style={{
            display: "flex",
            gap: 24,
            marginBottom: 24,
          }}>
            <div style={{
              background: "#12121a",
              border: "1px solid #2a2a3a",
              borderRadius: 12,
              padding: 24,
              flex: "0 0 180px",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 48, fontWeight: 700, color: STATUS_COLORS[scorecard.status] }}>
                {scorecard.composite_score.toFixed(1)}
              </div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>composite score</div>
              {scorecard.delta !== null && (
                <div style={{
                  fontSize: 14,
                  color: scorecard.delta > 0 ? "#4ade80" : scorecard.delta < 0 ? "#f87171" : "#888",
                  marginTop: 8,
                }}>
                  {scorecard.delta > 0 ? "↑" : scorecard.delta < 0 ? "↓" : "→"} {Math.abs(scorecard.delta).toFixed(1)} from prev
                </div>
              )}
              <div style={{
                marginTop: 12,
                height: 4,
                background: "#1a1a25",
                borderRadius: 2,
                overflow: "hidden",
              }}>
                <div style={{
                  height: "100%",
                  width: `${scorecard.confidence * 100}%`,
                  background: "#7c5cfc",
                  borderRadius: 2,
                }} />
              </div>
              <div style={{ fontSize: 10, color: "#666", marginTop: 4 }}>
                {(scorecard.confidence * 100).toFixed(0)}% confidence
              </div>
            </div>

            {/* Chart */}
            <div style={{
              background: "#12121a",
              border: "1px solid #2a2a3a",
              borderRadius: 12,
              padding: 16,
              flex: 1,
              minHeight: 160,
            }}>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>Score History</div>
              <canvas ref={canvasRef} style={{ width: "100%", height: 130 }} />
            </div>
          </div>

          {/* Metric Bars */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}>
            <MetricBar label="Avg Rating" value={scorecard.metrics.avg_rating} max={5} format={v => `${v.toFixed(1)} / 5`} color="#fbbf24" />
            <MetricBar label="Avg Play Duration" value={scorecard.metrics.avg_play_secs} max={300} format={v => `${Math.round(v)}s`} color="#4ade80" />
            <MetricBar label="High Rated (4-5)" value={scorecard.metrics.high_rate} max={1} format={v => `${(v * 100).toFixed(0)}%`} color="#4ade80" />
            <MetricBar label="Low Rated (1-2)" value={scorecard.metrics.low_rate} max={1} format={v => `${(v * 100).toFixed(0)}%`} color="#f87171" invert />
            <MetricBar label="Human Override Rate" value={scorecard.metrics.human_override_rate} max={1} format={v => `${(v * 100).toFixed(0)}%`} color="#f87171" invert />
            <MetricBar label="Skip Rate (<30s)" value={scorecard.metrics.skip_rate} max={1} format={v => `${(v * 100).toFixed(0)}%`} color="#f87171" invert />
            <MetricBar label="Rating Trend" value={(scorecard.metrics.rating_trend + 1) / 2} max={1} format={() => scorecard.metrics.rating_trend > 0 ? `↑ ${scorecard.metrics.rating_trend.toFixed(2)}` : scorecard.metrics.rating_trend < 0 ? `↓ ${scorecard.metrics.rating_trend.toFixed(2)}` : "→ flat"} color="#818cf8" />
            <MetricBar label="Curator Rewards" value={(scorecard.golden_count + scorecard.avoid_count)} max={10} format={() => `${scorecard.golden_count} golden, ${scorecard.avoid_count} avoid`} color="#ca8a04" />
          </div>
        </div>
      )}

      {/* ═══ REWARDS TAB ═══ */}
      {activeTab === "rewards" && (
        <div>
          {/* Add new reward */}
          <div style={{
            background: "#12121a",
            border: "1px solid #2a2a3a",
            borderRadius: 12,
            padding: 16,
            marginBottom: 20,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "#ddd" }}>
              Add Curator Reward
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              {["golden", "direction", "boundary", "avoid"].map(t => (
                <button key={t} onClick={() => setNewReward({ ...newReward, type: t })} style={{
                  background: newReward.type === t ? REWARD_COLORS[t].bg : "#0a0a0f",
                  border: `1px solid ${newReward.type === t ? REWARD_COLORS[t].border : "#2a2a3a"}`,
                  color: newReward.type === t ? REWARD_COLORS[t].text : "#888",
                  padding: "5px 12px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 11,
                  fontFamily: "inherit",
                }}>
                  {REWARD_ICONS[t]} {t}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                value={newReward.note}
                onChange={e => setNewReward({ ...newReward, note: e.target.value })}
                onKeyDown={e => e.key === "Enter" && addReward()}
                placeholder={
                  newReward.type === "golden" ? "Why is this pattern perfect?"
                  : newReward.type === "avoid" ? "What should the agent avoid?"
                  : newReward.type === "direction" ? "What direction should the music go?"
                  : "What's the boundary?"
                }
                style={{
                  flex: 1,
                  background: "#0a0a0f",
                  border: "1px solid #2a2a3a",
                  color: "#e0e0ee",
                  padding: "8px 12px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontFamily: "inherit",
                  outline: "none",
                }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 10, color: "#666" }}>wt</span>
                <input
                  type="range" min={1} max={10}
                  value={newReward.weight}
                  onChange={e => setNewReward({ ...newReward, weight: parseInt(e.target.value) })}
                  style={{ width: 60, accentColor: "#7c5cfc" }}
                />
                <span style={{ fontSize: 11, color: "#aaa", width: 16, textAlign: "center" }}>
                  {newReward.weight}
                </span>
              </div>
              <button onClick={addReward} style={{
                background: "#7c5cfc",
                color: "#fff",
                border: "none",
                padding: "8px 16px",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 12,
                fontFamily: "inherit",
              }}>Add</button>
            </div>
          </div>

          {/* Existing rewards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rewards.map(r => {
              const colors = REWARD_COLORS[r.type] || REWARD_COLORS.direction;
              return (
                <div key={r.id} style={{
                  background: colors.bg,
                  border: `1px solid ${colors.border}44`,
                  borderLeft: `3px solid ${colors.border}`,
                  borderRadius: 8,
                  padding: "10px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}>
                  <span style={{ fontSize: 16, opacity: 0.8 }}>{REWARD_ICONS[r.type]}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: colors.text }}>{r.note}</div>
                    <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>
                      {r.type} · weight {r.weight}/10 · {r.created}
                    </div>
                  </div>
                  <button onClick={() => removeReward(r.id)} style={{
                    background: "none",
                    border: "none",
                    color: "#555",
                    cursor: "pointer",
                    fontSize: 14,
                    padding: 4,
                  }}>×</button>
                </div>
              );
            })}
          </div>

          {rewards.length === 0 && (
            <div style={{ textAlign: "center", padding: 40, color: "#555", fontSize: 13 }}>
              No curator rewards yet. Add one above to guide the agent.
            </div>
          )}
        </div>
      )}

      {/* ═══ ROLLBACK TAB ═══ */}
      {activeTab === "rollback" && (
        <div>
          <div style={{
            background: "#12121a",
            border: "1px solid #2a2a3a",
            borderRadius: 12,
            padding: 16,
            marginBottom: 20,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "#ddd" }}>
              Version History
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {history.map((h, i) => {
                const isCurrent = h.version === scorecard.version;
                return (
                  <div key={h.version} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 14px",
                    background: isCurrent ? "#7c5cfc11" : "#0a0a0f",
                    border: `1px solid ${isCurrent ? "#7c5cfc44" : "#1e1e2e"}`,
                    borderRadius: 8,
                  }}>
                    <div style={{
                      width: 32, height: 32,
                      borderRadius: "50%",
                      background: STATUS_COLORS[h.status] + "22",
                      border: `2px solid ${STATUS_COLORS[h.status]}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 700,
                      color: STATUS_COLORS[h.status],
                    }}>
                      v{h.version}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: "#ddd" }}>
                        Score: {h.score.toFixed(1)}
                        {i > 0 && (
                          <span style={{
                            fontSize: 11,
                            marginLeft: 8,
                            color: h.score > history[i-1].score ? "#4ade80" : h.score < history[i-1].score ? "#f87171" : "#888",
                          }}>
                            {h.score > history[i-1].score ? "↑" : h.score < history[i-1].score ? "↓" : "→"}
                            {Math.abs(h.score - history[i-1].score).toFixed(1)}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: "#666" }}>
                        {h.evolutions} evolutions · {h.status}
                      </div>
                    </div>
                    {isCurrent && (
                      <span style={{
                        fontSize: 10,
                        padding: "2px 8px",
                        borderRadius: 10,
                        background: "#7c5cfc33",
                        color: "#7c5cfc",
                      }}>current</span>
                    )}
                    {!isCurrent && h.version < scorecard.version && (
                      <button onClick={() => { setRollbackTarget(h.version); setShowRollback(true); }} style={{
                        background: "#1a1a25",
                        border: "1px solid #2a2a3a",
                        color: "#fbbf24",
                        padding: "4px 12px",
                        borderRadius: 6,
                        cursor: "pointer",
                        fontSize: 11,
                        fontFamily: "inherit",
                      }}>
                        ↺ Revert to this
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rollback confirmation modal */}
          {showRollback && (
            <div style={{
              background: "#1a0a0a",
              border: "1px solid #dc262644",
              borderRadius: 12,
              padding: 20,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#fca5a5", marginBottom: 8 }}>
                Confirm Rollback
              </div>
              <div style={{ fontSize: 12, color: "#ccc", marginBottom: 16 }}>
                Revert from v{scorecard.version} (score {scorecard.composite_score.toFixed(1)}) back to v{rollbackTarget} (score {history.find(h => h.version === rollbackTarget)?.score.toFixed(1)}).
                Lessons learned in v{scorecard.version} will be discarded. This cannot be undone.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={doRollback} style={{
                  background: "#dc2626",
                  color: "#fff",
                  border: "none",
                  padding: "8px 20px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 12,
                  fontFamily: "inherit",
                }}>
                  ↺ Revert to v{rollbackTarget}
                </button>
                <button onClick={() => setShowRollback(false)} style={{
                  background: "#1a1a25",
                  color: "#888",
                  border: "1px solid #2a2a3a",
                  padding: "8px 20px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 12,
                  fontFamily: "inherit",
                }}>Cancel</button>
              </div>
            </div>
          )}

          {/* Auto-rollback policy */}
          <div style={{
            background: "#12121a",
            border: "1px solid #2a2a3a",
            borderRadius: 12,
            padding: 16,
            marginTop: 16,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#ddd" }}>
              Auto-Rollback Policy
            </div>
            <div style={{ fontSize: 11, color: "#888", lineHeight: 1.6 }}>
              When a skill version's score drops more than <span style={{ color: "#fbbf24" }}>10 points</span> below the previous version with at least <span style={{ color: "#fbbf24" }}>50%</span> confidence, the system flags it for your review. Currently set to <span style={{ color: "#4ade80" }}>require curator approval</span> (no auto-revert).
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Metric Bar Component ─────────────────────────
function MetricBar({ label, value, max, format, color, invert = false }) {
  const pct = Math.min((value / max) * 100, 100);
  const displayPct = invert ? 100 - pct : pct;
  const barColor = invert ? (pct > 30 ? "#f87171" : pct > 15 ? "#fbbf24" : "#4ade80") : color;

  return (
    <div style={{
      background: "#12121a",
      border: "1px solid #2a2a3a",
      borderRadius: 8,
      padding: "10px 14px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: "#888" }}>{label}</span>
        <span style={{ fontSize: 11, color: barColor, fontWeight: 600 }}>{format(value)}</span>
      </div>
      <div style={{
        height: 4,
        background: "#1a1a25",
        borderRadius: 2,
        overflow: "hidden",
      }}>
        <div style={{
          height: "100%",
          width: `${displayPct}%`,
          background: barColor,
          borderRadius: 2,
          transition: "width 0.5s ease",
        }} />
      </div>
    </div>
  );
}
