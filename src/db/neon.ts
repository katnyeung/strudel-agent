import { neon } from '@neondatabase/serverless';
import type {
  SessionRecord, SessionEndStats,
  EvolutionEvent, RatingEvent, CommandEvent,
} from '../types.js';

/**
 * Neon serverless event logger.
 * Fire-and-forget — never blocks the music pipeline.
 * If NEON_DATABASE_URL is unset, all functions return silently.
 */

let sql: ReturnType<typeof neon> | null = null;

export async function connectNeon(): Promise<void> {
  const url = process.env.NEON_DATABASE_URL;
  if (!url) {
    console.log('[neon] NEON_DATABASE_URL not set — logging disabled');
    return;
  }

  try {
    sql = neon(url);
    // Verify connectivity
    await sql`SELECT 1`;
    console.log('[neon] connected');
  } catch (e: any) {
    console.error('[neon] connection failed:', e.message);
    sql = null;
  }
}

export async function disconnectNeon(): Promise<void> {
  // neon() serverless driver is stateless (HTTP-based), no pool to close
  sql = null;
  console.log('[neon] disconnected');
}

export function isConnected(): boolean {
  return sql !== null;
}

// ─── Session lifecycle ──────────────────────────

export async function startSession(record: SessionRecord): Promise<void> {
  if (!sql) return;
  await sql`
    INSERT INTO sessions (id, skill_id, skill_name, started_at)
    VALUES (${record.id}, ${record.skill_id ?? null}, ${record.skill_name ?? null}, NOW())
  `;
}

export async function updateSessionSkill(
  id: string, skillId: string, skillName: string,
): Promise<void> {
  if (!sql) return;
  await sql`
    UPDATE sessions
    SET skill_id = ${skillId}, skill_name = ${skillName}
    WHERE id = ${id}
  `;
}

export async function endSession(id: string, stats: SessionEndStats): Promise<void> {
  if (!sql) return;
  await sql`
    UPDATE sessions
    SET ended_at = NOW(),
        total_evolves = ${stats.total_evolves},
        avg_rating = ${stats.avg_rating ?? null},
        final_code = ${stats.final_code ?? null}
    WHERE id = ${id}
  `;
}

// ─── Event logging ──────────────────────────────

export async function logEvolution(event: EvolutionEvent): Promise<void> {
  if (!sql) return;
  await sql`
    INSERT INTO evolution_events
      (session_id, phase, move_type, code_before, code_after, voices, voice_count, reason, created_at)
    VALUES (
      ${event.session_id},
      ${event.phase},
      ${event.move_type ?? null},
      ${event.code_before ?? null},
      ${event.code_after},
      ${JSON.stringify(event.voices ?? [])},
      ${event.voice_count ?? 0},
      ${event.reason ?? null},
      NOW()
    )
  `;
}

export async function logRating(event: RatingEvent): Promise<void> {
  if (!sql) return;
  await sql`
    INSERT INTO ratings (session_id, rating, code_snapshot, voice_name, voice_type, created_at)
    VALUES (${event.session_id}, ${event.rating}, ${event.code_snapshot ?? null}, ${event.voice_name ?? null}, ${event.voice_type ?? null}, NOW())
  `;
}

export async function logCommand(event: CommandEvent): Promise<void> {
  if (!sql) return;
  await sql`
    INSERT INTO human_commands (session_id, command, code_before, code_after, created_at)
    VALUES (
      ${event.session_id},
      ${event.command},
      ${event.code_before ?? null},
      ${event.code_after ?? null},
      NOW()
    )
  `;
}
