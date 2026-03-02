/**
 * Analysis Pipeline — ETL from Neon to Neo4j
 *
 * Reads accumulated event data from Neon (Postgres),
 * extracts voice states and transitions,
 * then writes state-centric musical knowledge to Neo4j.
 *
 * Can run on-demand via API or on a schedule.
 * Uses a watermark table (analysis_runs) to avoid reprocessing.
 */

import { neon } from '@neondatabase/serverless';
import * as neo4jClient from './neo4j.js';
import { voiceStateId, voiceTypesFromNames, extractVoiceNames } from './voice-parser.js';

// ─── Types ────────────────────────────────────────

interface EvolutionRow {
  id: number;
  session_id: string;
  phase: string;
  move_type: string | null;
  code_before: string | null;
  code_after: string;
  voices: any;               // JSONB
  voice_count: number;
  reason: string | null;
  created_at: string;
  // Joined from sessions
  skill_id: string | null;
}

interface RatingRow {
  id: number;
  session_id: string;
  rating: number;
  evolution_id: number | null;
  code_snapshot: string | null;
  created_at: string;
}

interface AnalysisResult {
  events_processed: number;
  states_written: number;
  transitions_written: number;
  skills_processed: string[];
  duration_ms: number;
  status: 'complete' | 'failed';
  error?: string;
}

// ─── SQL client ───────────────────────────────────

let sql: ReturnType<typeof neon> | null = null;

function getSql(): ReturnType<typeof neon> | null {
  if (sql) return sql;
  const url = process.env.NEON_DATABASE_URL;
  if (!url) return null;
  sql = neon(url);
  return sql;
}

// ═══════════════════════════════════════════════════
// Main pipeline
// ═══════════════════════════════════════════════════

/**
 * Run the full analysis pipeline.
 * Extracts events from Neon since last run, transforms, loads to Neo4j.
 */
export async function runAnalysis(since?: Date): Promise<AnalysisResult> {
  const start = Date.now();
  const db = getSql();

  const empty: AnalysisResult = {
    events_processed: 0, states_written: 0, transitions_written: 0,
    skills_processed: [], duration_ms: 0, status: 'failed',
  };

  if (!db) {
    return { ...empty, error: 'NEON_DATABASE_URL not set' };
  }

  if (!neo4jClient.isConnected()) {
    return { ...empty, error: 'Neo4j not connected' };
  }

  try {
    // Record this analysis run
    const runId = await startRun(db);

    // Get watermark (last successful run time)
    const watermark = since ?? await getWatermark(db);

    // EXTRACT: Get events since watermark
    const events = await extractEvents(db, watermark);
    const ratings = await extractRatings(db, watermark);

    if (events.length === 0) {
      await endRun(db, runId, 0, 0, 'complete');
      return { ...empty, duration_ms: Date.now() - start, status: 'complete' };
    }

    console.log(`[analysis] processing ${events.length} events, ${ratings.length} ratings`);

    // Build a rating lookup: session_id → ratings ordered by time
    const ratingsBySession = new Map<string, RatingRow[]>();
    for (const r of ratings) {
      const list = ratingsBySession.get(r.session_id) ?? [];
      list.push(r);
      ratingsBySession.set(r.session_id, list);
    }

    // TRANSFORM + LOAD: Process each event
    let statesWritten = 0;
    let transitionsWritten = 0;
    const skillsProcessed = new Set<string>();

    // Track previous state per session for transition edges
    const prevState = new Map<string, { stateId: string; rating: number | null }>();

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const skillId = event.skill_id ?? 'unknown';
      skillsProcessed.add(skillId);

      // Extract voice names from code_after
      const voiceNames = extractVoiceNames(event.code_after);
      if (voiceNames.length === 0) continue;

      const stateId = voiceStateId(skillId, voiceNames);
      const voiceTypes = voiceTypesFromNames(voiceNames);

      // Compute play duration (time to next event in same session)
      let playSecs = 60;
      if (i + 1 < events.length && events[i + 1].session_id === event.session_id) {
        const nextTime = new Date(events[i + 1].created_at).getTime();
        const thisTime = new Date(event.created_at).getTime();
        playSecs = Math.round((nextTime - thisTime) / 1000);
      }

      // Find closest rating for this event
      const sessionRatings = ratingsBySession.get(event.session_id) ?? [];
      const eventTime = new Date(event.created_at).getTime();
      const closestRating = findClosestRating(sessionRatings, eventTime);

      // LOAD: Write VoiceState
      try {
        await neo4jClient.writeVoiceState({
          id: stateId,
          skill_id: skillId,
          voices: voiceNames,
          voice_types: voiceTypes,
          has_melody: voiceTypes.includes('melody'),
          has_bass: voiceTypes.includes('bass'),
          has_chords: voiceTypes.includes('harmony'),
          rating: closestRating,
          play_secs: playSecs,
          timestamp: toIso(event.created_at),
        });
        statesWritten++;
      } catch (e: any) {
        console.error(`[analysis] writeVoiceState failed for event ${event.id}:`, e.message);
        continue;
      }

      // LOAD: Write TRANSITION edge (only when voice set changed — no self-loops)
      const prev = prevState.get(event.session_id);
      if (prev && prev.stateId !== stateId) {
        try {
          await neo4jClient.writeTransition({
            from_id: prev.stateId,
            to_id: stateId,
            move_type: event.move_type ?? 'unknown',
            rating_before: prev.rating,
            rating_after: closestRating,
            timestamp: toIso(event.created_at),
          });
          transitionsWritten++;
        } catch (e: any) {
          console.error(`[analysis] writeTransition failed for event ${event.id}:`, e.message);
        }
      }

      // Update previous state for this session
      prevState.set(event.session_id, { stateId, rating: closestRating });
    }

    await endRun(db, runId, events.length, statesWritten, 'complete');

    const result: AnalysisResult = {
      events_processed: events.length,
      states_written: statesWritten,
      transitions_written: transitionsWritten,
      skills_processed: [...skillsProcessed],
      duration_ms: Date.now() - start,
      status: 'complete',
    };

    console.log(`[analysis] complete:`, result);
    return result;

  } catch (e: any) {
    console.error('[analysis] pipeline failed:', e.message);
    return {
      events_processed: 0, states_written: 0, transitions_written: 0,
      skills_processed: [], duration_ms: Date.now() - start,
      status: 'failed', error: e.message,
    };
  }
}

// ═══════════════════════════════════════════════════
// Extract
// ═══════════════════════════════════════════════════

async function extractEvents(db: ReturnType<typeof neon>, since: Date): Promise<EvolutionRow[]> {
  const rows = await db`
    SELECT e.id, e.session_id, e.phase, e.move_type, e.code_before,
           e.code_after, e.voices, e.voice_count, e.reason, e.created_at,
           s.skill_id
    FROM evolution_events e
    JOIN sessions s ON s.id = e.session_id
    WHERE e.created_at > ${since.toISOString()}
    ORDER BY e.created_at ASC
  `;
  return rows as EvolutionRow[];
}

async function extractRatings(db: ReturnType<typeof neon>, since: Date): Promise<RatingRow[]> {
  const rows = await db`
    SELECT id, session_id, rating, code_snapshot, created_at
    FROM ratings
    WHERE created_at > ${since.toISOString()}
    ORDER BY created_at ASC
  `;
  return rows as RatingRow[];
}

// ═══════════════════════════════════════════════════
// Watermark tracking
// ═══════════════════════════════════════════════════

async function getWatermark(db: ReturnType<typeof neon>): Promise<Date> {
  try {
    const rows = await db`
      SELECT ended_at FROM analysis_runs
      WHERE status = 'complete'
      ORDER BY ended_at DESC
      LIMIT 1
    ` as any[];
    if (rows.length > 0 && rows[0].ended_at) {
      return new Date(rows[0].ended_at);
    }
  } catch {
    // Table might not exist yet — return epoch
  }
  return new Date(0); // process everything
}

async function startRun(db: ReturnType<typeof neon>): Promise<number> {
  try {
    const rows = await db`
      INSERT INTO analysis_runs (started_at, status)
      VALUES (NOW(), 'running')
      RETURNING id
    ` as any[];
    return rows[0].id;
  } catch {
    // Table might not exist, try to create it
    await db`
      CREATE TABLE IF NOT EXISTS analysis_runs (
        id              SERIAL PRIMARY KEY,
        started_at      TIMESTAMPTZ NOT NULL,
        ended_at        TIMESTAMPTZ,
        events_processed INT DEFAULT 0,
        patterns_written INT DEFAULT 0,
        status          TEXT DEFAULT 'running'
      )
    `;
    const rows = await db`
      INSERT INTO analysis_runs (started_at, status)
      VALUES (NOW(), 'running')
      RETURNING id
    ` as any[];
    return rows[0].id;
  }
}

async function endRun(
  db: ReturnType<typeof neon>,
  runId: number,
  eventsProcessed: number,
  statesWritten: number,
  status: string,
): Promise<void> {
  await db`
    UPDATE analysis_runs
    SET ended_at = NOW(),
        events_processed = ${eventsProcessed},
        patterns_written = ${statesWritten},
        status = ${status}
    WHERE id = ${runId}
  `;
}

// ═══════════════════════════════════════════════════
// Status
// ═══════════════════════════════════════════════════

export async function getAnalysisStatus(): Promise<{
  last_run: string | null;
  events_since: number;
  status: string;
}> {
  const db = getSql();
  if (!db) {
    return { last_run: null, events_since: 0, status: 'neon_not_configured' };
  }

  try {
    // Last run
    const lastRun = await db`
      SELECT ended_at, events_processed, patterns_written, status
      FROM analysis_runs
      ORDER BY started_at DESC
      LIMIT 1
    ` as any[];

    // Events since last run
    const watermark = lastRun.length > 0 && lastRun[0].ended_at
      ? lastRun[0].ended_at
      : new Date(0).toISOString();

    const countResult = await db`
      SELECT count(*) as cnt
      FROM evolution_events
      WHERE created_at > ${watermark}
    ` as any[];

    return {
      last_run: lastRun.length > 0 ? JSON.stringify(lastRun[0]) : null,
      events_since: parseInt(countResult[0].cnt),
      status: neo4jClient.isConnected() ? 'ready' : 'neo4j_not_connected',
    };
  } catch (e: any) {
    return { last_run: null, events_since: 0, status: `error: ${e.message}` };
  }
}

// ═══════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════

/** Convert Postgres timestamp to ISO 8601 for Neo4j datetime() */
function toIso(pgTimestamp: string): string {
  return new Date(pgTimestamp).toISOString();
}

/** Find the rating closest in time to a given event timestamp */
function findClosestRating(ratings: RatingRow[], eventTimeMs: number): number | null {
  if (ratings.length === 0) return null;

  let closest: RatingRow | null = null;
  let minDist = Infinity;

  for (const r of ratings) {
    const rTime = new Date(r.created_at).getTime();
    const dist = Math.abs(rTime - eventTimeMs);
    // Only consider ratings within 5 minutes of the event
    if (dist < 5 * 60 * 1000 && dist < minDist) {
      minDist = dist;
      closest = r;
    }
  }

  return closest?.rating ?? null;
}
