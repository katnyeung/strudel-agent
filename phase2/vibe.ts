import type { LlmGateway } from './llm.js';
import type { Skill } from './types.js';
import { allSkills, getBaseKnowledge } from './skills.js';
import { webSearch } from './web-search.js';

/**
 * Vibe Engine — research-driven musical intelligence.
 *
 * This is NOT a skill factory. It does two things:
 *
 * 1. vibeMatch() — maps a natural language feeling to the best existing skill
 * 2. researchForEvolution() — searches the web for musical knowledge to make
 *    the next evolution cycle smarter (new rhythms, chord voicings, patterns)
 *
 * The agent calls researchForEvolution() before each evolution tick.
 * Over time, the music improves because the agent keeps learning.
 */

// ═══════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════

export interface VibeContext {
  originalVibe: string;       // what the user said
  mood: string;               // extracted mood
  energy: string;             // energy level
  keywords: string[];         // key imagery words
  matchedSkill: Skill;        // which skill we're using
  matchReason: string;        // why this skill fits
}

export interface ResearchInsight {
  query: string;              // what we searched for
  insight: string;            // what we learned (LLM-summarized)
  patterns: string[];         // specific Strudel-applicable ideas
}

// Cache to avoid searching the same thing repeatedly
const researchCache = new Map<string, { insight: ResearchInsight; timestamp: number }>();
const CACHE_TTL = 10 * 60_000; // 10 minutes

// ═══════════════════════════════════════════════════
// 1. Vibe → Skill matching (uses LLM for semantic match)
// ═══════════════════════════════════════════════════

export async function vibeMatch(
  vibeText: string,
  llm: LlmGateway,
  onStatus?: (msg: string) => void,
): Promise<VibeContext> {
  const status = onStatus ?? (() => {});
  const skills = allSkills();

  if (skills.length === 0) {
    throw new Error('No skills loaded — add skills to the skills/ directory');
  }

  status('🎭 Understanding your vibe...');

  // Build a concise skill catalog for the LLM
  const catalog = skills.map(s =>
    `ID: ${s.id} | ${s.icon} ${s.name} | ${s.description.slice(0, 100)} | tags: ${s.tags.join(', ')} | BPM: ${s.tempo.min}-${s.tempo.max}`
  ).join('\n');

  const prompt = `A person who knows NOTHING about music says they want:
"${vibeText}"

Available music skills:
${catalog}

Pick the BEST matching skill. Then extract the vibe details.

Respond ONLY with JSON (no markdown, no backticks):
{
  "skillId": "the id of the best matching skill",
  "matchReason": "one sentence explaining why this skill fits their vibe, in plain language",
  "mood": "one word mood (melancholy, peaceful, dreamy, energetic, dark, warm, playful, etc.)",
  "energy": "very low / low / medium / high / very high",
  "keywords": ["3-5 imagery keywords from their description"]
}`;

  const result = await llm.chat(
    'You are a music curator. Match feelings to music styles. Respond only with valid JSON.',
    [{ role: 'user', content: prompt }],
  );

  try {
    const cleaned = result.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
    const data = JSON.parse(cleaned);

    const skill = skills.find(s => s.id === data.skillId) ?? skills[0];

    status(`🎯 ${skill.icon} ${skill.name} — ${data.matchReason}`);

    return {
      originalVibe: vibeText,
      mood: data.mood ?? 'chill',
      energy: data.energy ?? 'low',
      keywords: data.keywords ?? vibeText.split(/\s+/).slice(0, 4),
      matchedSkill: skill,
      matchReason: data.matchReason ?? `Using ${skill.name}`,
    };
  } catch {
    // Fallback: pick first skill
    const fallback = skills[0];
    status(`🎵 Defaulting to ${fallback.icon} ${fallback.name}`);
    return {
      originalVibe: vibeText,
      mood: 'chill', energy: 'low',
      keywords: vibeText.split(/\s+/).slice(0, 4),
      matchedSkill: fallback,
      matchReason: `Starting with ${fallback.name}`,
    };
  }
}

// ═══════════════════════════════════════════════════
// 2. Research for evolution — the self-learning part
// ═══════════════════════════════════════════════════

/**
 * Called before each evolution tick. Searches the web for musical knowledge
 * relevant to what's currently playing, and returns actionable insights
 * the agent can use to make better evolution moves.
 *
 * Returns null if no useful research found (agent falls back to its own knowledge).
 */
export async function researchForEvolution(
  currentCode: string,
  skill: Skill,
  vibeContext: VibeContext | null,
  evolveCount: number,
  llm: LlmGateway,
): Promise<ResearchInsight | null> {

  // Decide what to research based on where we are in the evolution
  const query = pickResearchQuery(skill, vibeContext, evolveCount, currentCode);
  if (!query) return null;

  // Check cache first
  const cacheKey = query.toLowerCase().trim();
  const cached = researchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[vibe] cache hit: "${query}"`);
    return cached.insight;
  }

  console.log(`[vibe] researching: "${query}"`);

  try {
    const rawResults = await webSearch(query);
    if (!rawResults || rawResults.length < 50) return null;

    // Have the LLM extract actionable musical patterns from search results
    const extraction = await llm.chat(
      `You are a Strudel live-coder. Extract practical, actionable musical ideas from search results.
You know Strudel syntax: note(), s(), .sound(), .lpf(), .room(), .delay(), .gain(), .slow(), .fast(), .swing(), .degradeBy(), chord().voicing(), n().scale(), .beat()
Only suggest things that can be expressed in Strudel.`,
      [{
        role: 'user',
        content: `I'm evolving a ${skill.name} track. Current code:
${currentCode}

Search results for "${query}":
${rawResults.slice(0, 3000)}

Extract 2-3 specific, actionable ideas I could apply. For each idea, describe:
1. What to do (in plain language)
2. How it would sound/feel
3. A rough Strudel pattern hint (if applicable)

Respond ONLY with JSON (no markdown):
{
  "insight": "one paragraph summary of what you learned",
  "patterns": ["idea 1: description + hint", "idea 2: description + hint", "idea 3: description + hint"]
}`,
      }],
    );

    const cleaned = extraction.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
    const data = JSON.parse(cleaned);

    const insight: ResearchInsight = {
      query,
      insight: data.insight ?? '',
      patterns: data.patterns ?? [],
    };

    // Cache it
    researchCache.set(cacheKey, { insight, timestamp: Date.now() });

    return insight;
  } catch (e: any) {
    console.log(`[vibe] research failed for "${query}": ${e.message}`);
    return null;
  }
}

/**
 * Pick what to research based on the current state.
 * Rotates through different research angles to keep learning varied.
 */
function pickResearchQuery(
  skill: Skill,
  vibeContext: VibeContext | null,
  evolveCount: number,
  currentCode: string,
): string | null {
  // Don't research every single evolution — every 2nd or 3rd to save API costs
  if (evolveCount % 3 !== 0 && evolveCount > 1) return null;

  const genre = skill.name.toLowerCase();
  const vibeKeywords = vibeContext?.keywords.join(' ') ?? '';
  const mood = vibeContext?.mood ?? 'chill';

  // Analyze what's in the code to research what's missing
  const hasChords = /chord\(/.test(currentCode);
  const hasBass = /\$bass/.test(currentCode);
  const hasDrums = /\$(kick|snare|hat|drum)/.test(currentCode);
  const hasMelody = /\$(melody|arp|lead)/.test(currentCode);

  // Build a rotation of research topics
  const topics: string[] = [];

  // Always relevant
  topics.push(`${genre} rhythm patterns beat programming`);
  topics.push(`${genre} chord progressions voicings`);

  // Vibe-specific
  if (vibeKeywords) {
    topics.push(`${vibeKeywords} music style characteristics`);
  }

  // Fill gaps in current arrangement
  if (!hasBass) topics.push(`${genre} bass line patterns`);
  if (!hasDrums) topics.push(`${genre} drum patterns programming`);
  if (!hasChords) topics.push(`${genre} chord voicings progressions`);
  if (!hasMelody && evolveCount > 3) topics.push(`${genre} melody patterns scales`);

  // Mood-specific research
  topics.push(`${mood} music production techniques`);

  // Pick one based on evolve count (rotates through)
  const idx = Math.floor(evolveCount / 3) % topics.length;
  return topics[idx];
}

// ═══════════════════════════════════════════════════
// 3. Build an evolution prompt enriched with research
// ═══════════════════════════════════════════════════

/**
 * Enhances the evolution move description with research insights.
 * Called by agent.ts when making an evolution move.
 */
export function enrichEvolutionMove(
  baseMove: string,
  research: ResearchInsight | null,
): string {
  if (!research || research.patterns.length === 0) return baseMove;

  // Pick one pattern from the research to inspire this move
  const pattern = research.patterns[Math.floor(Math.random() * research.patterns.length)];

  return `${baseMove}

RESEARCH INSIGHT (use this to inform your change):
${research.insight}

SPECIFIC IDEA TO TRY:
${pattern}

Apply the research insight to make a more interesting, genre-authentic change.`;
}

// ═══════════════════════════════════════════════════
// 4. Vibe-aware human command interpretation
// ═══════════════════════════════════════════════════

/**
 * For plain-language commands from non-musicians, provides
 * extra context about what their words mean musically.
 */
export function vibeCommandContext(command: string, vibeContext: VibeContext | null): string {
  if (!vibeContext) return '';

  return `
VIBE CONTEXT: The listener described their desired feeling as "${vibeContext.originalVibe}".
They're going for a ${vibeContext.mood} mood with ${vibeContext.energy} energy.
Key imagery: ${vibeContext.keywords.join(', ')}.
Keep changes aligned with this overall feeling.`;
}
