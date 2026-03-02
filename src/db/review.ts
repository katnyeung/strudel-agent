/**
 * LLM Review — Semantic Analysis of Graph Data
 *
 * Two modes:
 *   MERGE  — incremental: includes existing insights in the prompt so the LLM
 *            can update/refine them. Fast, cheap, run often.
 *
 *   FULL   — rewrite: reads ALL graph data for a skill, replaces
 *            existing insights entirely. Slower, run periodically.
 *
 * Both store MoveInsight + EvolutionRecipe nodes in Neo4j (in-place).
 * The agent receives these via graph-context.ts in evolution prompts.
 *
 * Prompts are loaded from skills/_review/v1/ — edit those files to
 * improve review quality without touching TypeScript.
 *
 * Uses separate REVIEW_LLM_* env vars (falls back to main LLM_* if unset).
 */

import fs from 'node:fs';
import path from 'node:path';
import { createLlm, type LlmGateway } from '../llm.js';
import * as neo4j from './neo4j.js';
import type { MoveInsightNode, EvolutionRecipeNode } from './graph-types.js';

// ═══════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════

export interface ReviewResult {
  mode: 'merge' | 'full';
  status: 'complete' | 'failed' | 'no_data';
  skills_reviewed: string[];
  skills_skipped: string[];
  duration_ms: number;
  error?: string;
}

interface SkillReviewData {
  stats: Awaited<ReturnType<typeof neo4j.getSkillVoiceStateStats>>;
}

interface ExistingInsights {
  moveInsight: MoveInsightNode | null;
  recipe: EvolutionRecipeNode | null;
}

interface LlmReviewResponse {
  move_intelligence: {
    groups: Array<{
      group_name: string;
      move_types: string[];
      works_when: string;
      avg_improvement: number;
    }>;
    top_insight: string;
  };
  evolution_recipes: {
    recipes: Array<{
      name: string;
      steps: string[];
      expected_rating: number;
      critical_step: string;
      description: string;
    }>;
    best_recipe_summary: string;
  };
}

// ═══════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════

let lastReviewResult: ReviewResult | null = null;

// ═══════════════════════════════════════════════════
// Review skill loader — reads prompt templates from
// skills/_review/v1/ (same pattern as _base/)
// ═══════════════════════════════════════════════════

interface ReviewSkillTemplates {
  systemPrompt: string;
  fullPrompt: string;
  mergePrompt: string;
  responseSchema: string;
}

let templates: ReviewSkillTemplates | null = null;

function loadTemplates(): ReviewSkillTemplates {
  if (templates) return templates;

  const skillsPath = process.env.SKILLS_PATH ?? './skills';
  const reviewDir = path.join(skillsPath, '_review');

  // Find latest version
  let versionDir = path.join(reviewDir, 'v1');
  if (fs.existsSync(reviewDir)) {
    const versions = fs.readdirSync(reviewDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && /^v\d+$/.test(d.name))
      .map(d => ({ name: d.name, num: parseInt(d.name.slice(1)) }))
      .sort((a, b) => b.num - a.num);
    if (versions.length > 0) {
      versionDir = path.join(reviewDir, versions[0].name);
    }
  }

  const readFile = (name: string, fallback: string): string => {
    const filePath = path.join(versionDir, name);
    if (fs.existsSync(filePath)) {
      console.log(`[review] loaded template: ${name}`);
      return fs.readFileSync(filePath, 'utf-8');
    }
    console.warn(`[review] template not found: ${filePath}, using fallback`);
    return fallback;
  };

  templates = {
    systemPrompt: readFile('system.md', FALLBACK_SYSTEM),
    fullPrompt: readFile('full-prompt.md', FALLBACK_FULL),
    mergePrompt: readFile('merge-prompt.md', FALLBACK_MERGE),
    responseSchema: readFile('response-schema.json', FALLBACK_SCHEMA),
  };

  return templates;
}

/** Force reload templates (e.g. after editing skill files). */
export function reloadReviewTemplates(): void {
  templates = null;
  console.log('[review] templates cleared, will reload on next use');
}

// ═══════════════════════════════════════════════════
// LLM instance (separate from main agent LLM)
// ═══════════════════════════════════════════════════

let reviewLlm: LlmGateway | null = null;

function getReviewLlm(): LlmGateway {
  if (reviewLlm) return reviewLlm;

  reviewLlm = createLlm({
    provider: process.env.REVIEW_LLM_PROVIDER ?? process.env.LLM_PROVIDER ?? 'anthropic',
    apiKey: process.env.REVIEW_LLM_API_KEY ?? process.env.LLM_API_KEY ?? '',
    model: process.env.REVIEW_LLM_MODEL ?? process.env.LLM_MODEL ?? 'claude-sonnet-4-5-20250929',
    baseUrl: process.env.REVIEW_LLM_BASE_URL ?? process.env.LLM_BASE_URL ?? '',
  });

  console.log(`[review] LLM: ${reviewLlm.provider}`);
  return reviewLlm;
}

// ═══════════════════════════════════════════════════
// Entry points
// ═══════════════════════════════════════════════════

/**
 * Merge review — incremental.
 * Includes existing insights so the LLM refines rather than rewrites.
 */
export async function runMergeReview(skillId?: string): Promise<ReviewResult> {
  return runReviewPipeline('merge', skillId);
}

/**
 * Full review — complete rewrite.
 * Reads ALL graph data, replaces existing insights entirely.
 */
export async function runFullReview(skillId?: string): Promise<ReviewResult> {
  return runReviewPipeline('full', skillId);
}

// ═══════════════════════════════════════════════════
// Shared pipeline
// ═══════════════════════════════════════════════════

async function runReviewPipeline(
  mode: 'merge' | 'full',
  skillId?: string,
): Promise<ReviewResult> {
  const start = Date.now();

  if (!neo4j.isConnected()) {
    return lastReviewResult = {
      mode, status: 'failed', skills_reviewed: [], skills_skipped: [],
      duration_ms: 0, error: 'Neo4j not connected',
    };
  }

  try {
    const llm = getReviewLlm();

    const skillIds = skillId
      ? [skillId]
      : await neo4j.getDistinctSkillIds();

    if (skillIds.length === 0) {
      return lastReviewResult = {
        mode, status: 'no_data', skills_reviewed: [], skills_skipped: [],
        duration_ms: Date.now() - start,
      };
    }

    console.log(`[review] ${mode} review for ${skillIds.length} skill(s): ${skillIds.join(', ')}`);

    const reviewed: string[] = [];
    const skipped: string[] = [];

    for (const sid of skillIds) {
      try {
        const success = await reviewSkill(llm, sid, mode);
        if (success) {
          reviewed.push(sid);
        } else {
          skipped.push(sid);
        }
      } catch (e: any) {
        console.error(`[review] skill "${sid}" failed:`, e.message);
        skipped.push(sid);
      }
    }

    console.log(`[review] ${mode} complete: ${reviewed.length} reviewed, ${skipped.length} skipped`);

    return lastReviewResult = {
      mode, status: 'complete',
      skills_reviewed: reviewed,
      skills_skipped: skipped,
      duration_ms: Date.now() - start,
    };
  } catch (e: any) {
    console.error('[review] pipeline failed:', e.message);
    return lastReviewResult = {
      mode, status: 'failed', skills_reviewed: [], skills_skipped: [],
      duration_ms: Date.now() - start, error: e.message,
    };
  }
}

// ═══════════════════════════════════════════════════
// Per-skill review
// ═══════════════════════════════════════════════════

async function reviewSkill(
  llm: LlmGateway,
  skillId: string,
  mode: 'merge' | 'full',
): Promise<boolean> {
  // For merge: get existing insights
  let existing: ExistingInsights = { moveInsight: null, recipe: null };

  if (mode === 'merge') {
    const [mi, er] = await Promise.all([
      neo4j.getLatestMoveInsight(skillId),
      neo4j.getLatestEvolutionRecipe(skillId),
    ]);
    existing = { moveInsight: mi, recipe: er };
  }

  // Gather data (VoiceState uses running averages, no `since` needed)
  const stats = await neo4j.getSkillVoiceStateStats(skillId);

  // Skip if not enough data
  const minStates = mode === 'merge' ? 3 : 5;
  if (stats.state_count < minStates) {
    console.log(`[review] skipping "${skillId}" — insufficient data (${stats.state_count} states)`);
    return false;
  }

  console.log(`[review] ${mode} analyzing "${skillId}": ${stats.state_count} states, ${stats.total_visits} total visits`);

  // Load templates and build prompt
  const tpl = loadTemplates();
  const dataSections = formatDataSections({ stats });
  const schemaBlock = `Respond with this exact JSON structure:\n${tpl.responseSchema}`;

  let prompt: string;
  if (mode === 'merge') {
    prompt = tpl.mergePrompt
      .replace('{{SKILL_ID}}', skillId)
      .replace('{{EXISTING_INSIGHTS}}', formatExistingInsights(existing))
      .replace('{{DATA_SECTIONS}}', dataSections)
      .replace('{{RESPONSE_SCHEMA}}', schemaBlock);
  } else {
    prompt = tpl.fullPrompt
      .replace('{{SKILL_ID}}', skillId)
      .replace('{{DATA_SECTIONS}}', dataSections)
      .replace('{{RESPONSE_SCHEMA}}', schemaBlock);
  }

  const raw = await llm.chat(tpl.systemPrompt, [{ role: 'user', content: prompt }], 4096);

  // Parse response
  const parsed = parseReviewResponse(raw);
  if (!parsed) {
    console.warn(`[review] failed to parse LLM response for "${skillId}"`);
    return false;
  }

  // Store in Neo4j (MERGE = upsert in-place)
  const today = new Date().toISOString().slice(0, 10);

  await neo4j.writeMoveInsight({
    id: `mi_${skillId}_${today}`,
    skill_id: skillId,
    review_date: today,
    move_groups: JSON.stringify(parsed.move_intelligence.groups),
    top_insight: parsed.move_intelligence.top_insight,
    raw_response: raw,
  });

  await neo4j.writeEvolutionRecipe({
    id: `er_${skillId}_${today}`,
    skill_id: skillId,
    review_date: today,
    recipes: JSON.stringify(parsed.evolution_recipes.recipes),
    best_recipe_summary: parsed.evolution_recipes.best_recipe_summary,
    raw_response: raw,
  });

  console.log(`[review] ${mode} stored for "${skillId}": "${parsed.move_intelligence.top_insight.slice(0, 80)}..."`);
  return true;
}

// ═══════════════════════════════════════════════════
// Data formatting (injected into templates)
// ═══════════════════════════════════════════════════

function formatDataSections(data: SkillReviewData): string {
  const { stats } = data;

  const stateLines = stats.top_states.map(s =>
    `  [${s.voices.join(',')}]: ${s.visits} visits, avg rating ${s.avg_rating?.toFixed(1) ?? 'N/A'}`
  ).join('\n');

  return `SKILL METRICS:
  Total voice states: ${stats.state_count}
  Total visits: ${stats.total_visits}
  Average rating: ${stats.avg_rating?.toFixed(2) ?? 'N/A'}

TOP VOICE STATES (ranked by visits):
${stateLines || '  (no state data)'}`;
}

function formatExistingInsights(existing: ExistingInsights): string {
  const sections: string[] = [];

  if (existing.moveInsight) {
    sections.push(`EXISTING MOVE INSIGHTS (from ${existing.moveInsight.review_date}):`);
    sections.push(`  Top insight: ${existing.moveInsight.top_insight}`);
    try {
      const groups = JSON.parse(existing.moveInsight.move_groups);
      for (const g of groups) {
        sections.push(`  - ${g.group_name}: ${g.works_when} (avg +${g.avg_improvement})`);
      }
    } catch { /* skip */ }
  }

  if (existing.recipe) {
    sections.push(`\nEXISTING EVOLUTION RECIPES (from ${existing.recipe.review_date}):`);
    sections.push(`  Best recipe: ${existing.recipe.best_recipe_summary}`);
    try {
      const recipes = JSON.parse(existing.recipe.recipes);
      for (const r of recipes) {
        sections.push(`  - ${r.name}: ${r.steps.join(' → ')} (expected rating ${r.expected_rating})`);
      }
    } catch { /* skip */ }
  }

  if (sections.length === 0) {
    return 'EXISTING INSIGHTS: None (first review for this skill)\n';
  }

  return sections.join('\n') + '\n';
}

// ═══════════════════════════════════════════════════
// Response parsing
// ═══════════════════════════════════════════════════

function parseReviewResponse(raw: string): LlmReviewResponse | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed.move_intelligence && parsed.evolution_recipes) {
      return parsed as LlmReviewResponse;
    }
  } catch {
    // Try extracting JSON from markdown code block
    const jsonMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (parsed.move_intelligence && parsed.evolution_recipes) {
          return parsed as LlmReviewResponse;
        }
      } catch { /* fall through */ }
    }
  }

  console.warn('[review] could not parse response:', raw.slice(0, 200));
  return null;
}

// ═══════════════════════════════════════════════════
// Status
// ═══════════════════════════════════════════════════

export function getReviewStatus(): {
  last_review: ReviewResult | null;
  neo4j_connected: boolean;
  review_llm_configured: boolean;
} {
  return {
    last_review: lastReviewResult,
    neo4j_connected: neo4j.isConnected(),
    review_llm_configured: !!(
      process.env.REVIEW_LLM_API_KEY ?? process.env.LLM_API_KEY
    ),
  };
}

// ═══════════════════════════════════════════════════
// Fallback templates (used if skill files not found)
// ═══════════════════════════════════════════════════

const FALLBACK_SYSTEM = 'You are a music production analyst. You analyze data about AI-generated music patterns and extract actionable insights. Respond with valid JSON only — no markdown, no explanation.';

const FALLBACK_FULL = `Analyze ALL performance data for music skill "{{SKILL_ID}}":

{{DATA_SECTIONS}}

{{RESPONSE_SCHEMA}}`;

const FALLBACK_MERGE = `Update the analysis for music skill "{{SKILL_ID}}" with NEW data.

{{EXISTING_INSIGHTS}}
NEW DATA (since last review):
{{DATA_SECTIONS}}

Merge new findings with existing insights. Keep what's still valid, update what changed.

{{RESPONSE_SCHEMA}}`;

const FALLBACK_SCHEMA = `{
  "move_intelligence": {
    "groups": [{ "group_name": "", "move_types": [], "works_when": "", "avg_improvement": 0 }],
    "top_insight": ""
  },
  "evolution_recipes": {
    "recipes": [{ "name": "", "steps": [], "expected_rating": 0, "critical_step": "", "description": "" }],
    "best_recipe_summary": ""
  }
}`;
