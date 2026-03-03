import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { Skill, BuildStep } from './types.js';

/**
 * Loads skills from the filesystem.
 * 
 * Structure:
 *   skills/
 *     lofi-dj/
 *       v1/
 *         meta.yml, rules.md, build-sequence.yml, changelog.md
 *       v2/ ...
 * 
 * Always loads the LATEST version (highest vN number).
 * Call loadSkills() again to hot-reload.
 */

const skills = new Map<string, Skill>();
let baseKnowledgeCore = '';   // strudel.md only — sent with every call
let baseKnowledgeFull = '';   // all .md files combined — sent with bootstrap + human commands

export function loadSkills(basePath: string): Map<string, Skill> {
  skills.clear();

  if (!fs.existsSync(basePath)) {
    console.warn(`[skills] directory not found: ${basePath}`);
    return skills;
  }

  // Load .md files from _base/ as shared knowledge
  // Core = strudel.md only (syntax rules, output format, forbidden patterns)
  // Full = all .md files (core + composition.md + patterns.md)
  const baseDir = path.join(basePath, '_base');
  if (fs.existsSync(baseDir)) {
    const mdFiles = fs.readdirSync(baseDir)
      .filter(f => f.endsWith('.md'))
      .sort();

    const contents = new Map<string, string>();
    for (const f of mdFiles) {
      console.log(`[skills] loaded base knowledge: _base/${f}`);
      contents.set(f, fs.readFileSync(path.join(baseDir, f), 'utf-8'));
    }

    baseKnowledgeCore = contents.get('strudel.md') ?? '';
    baseKnowledgeFull = mdFiles.map(f => contents.get(f)!).join('\n\n');
  }

  const dirs = fs.readdirSync(basePath, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('_'))
    .map(d => d.name)
    .sort();

  for (const skillDir of dirs) {
    try {
      const skill = loadSkill(path.join(basePath, skillDir));
      if (skill) {
        skills.set(skill.id, skill);
        console.log(`[skills] loaded: ${skill.id} v${skill.version} (${skill.name}) — ${skill.buildSequence.length} steps`);
      }
    } catch (e: any) {
      console.error(`[skills] failed to load ${skillDir}: ${e.message}`);
    }
  }

  console.log(`[skills] ${skills.size} skills loaded`);
  return skills;
}

export function getBaseKnowledge(compact = false): string {
  return compact ? baseKnowledgeCore : baseKnowledgeFull;
}

function loadSkill(skillDir: string): Skill | null {
  // Find latest version directory
  const versionDir = findLatestVersion(skillDir);
  if (!versionDir) return null;

  // Read meta.yml
  const metaPath = path.join(versionDir, 'meta.yml');
  if (!fs.existsSync(metaPath)) {
    console.warn(`[skills] no meta.yml in ${versionDir}`);
    return null;
  }
  const meta = YAML.parse(fs.readFileSync(metaPath, 'utf-8'));

  // Read rules.md
  const rulesPath = path.join(versionDir, 'rules.md');
  const rules = fs.existsSync(rulesPath) ? fs.readFileSync(rulesPath, 'utf-8') : '';

  // Read build-sequence.yml
  const seqPath = path.join(versionDir, 'build-sequence.yml');
  let buildSequence: BuildStep[] = [];
  if (fs.existsSync(seqPath)) {
    const seq = YAML.parse(fs.readFileSync(seqPath, 'utf-8'));
    buildSequence = (seq?.steps ?? []).map((s: any) => ({
      stage: s.stage,
      description: s.description,
      code: s.code?.trim(),
    }));
  }

  // Read changelog.md (optional)
  const changelogPath = path.join(versionDir, 'changelog.md');
  const changelog = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf-8') : '';

  const tempo = meta.tempo ?? {};

  return {
    id: meta.id,
    name: meta.name,
    icon: meta.icon ?? '🎵',
    version: meta.version ?? 1,
    description: meta.description ?? '',
    rules,
    buildSequence,
    changelog,
    tempo: {
      min: tempo.min ?? 60,
      max: tempo.max ?? 140,
      default: tempo.default ?? 78,
    },
    tags: meta.tags ?? [],
    author: meta.author ?? 'unknown',
    path: versionDir,
  };
}

function findLatestVersion(skillDir: string): string | null {
  if (!fs.existsSync(skillDir)) return null;

  const versions = fs.readdirSync(skillDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^v\d+$/.test(d.name))
    .map(d => ({ name: d.name, num: parseInt(d.name.slice(1)) }))
    .sort((a, b) => b.num - a.num);  // descending — latest first

  if (versions.length === 0) return null;
  return path.join(skillDir, versions[0].name);
}

// ─── Public API ───────────────────────────────────

export function getSkill(id: string): Skill | undefined {
  return skills.get(id);
}

export function allSkills(): Skill[] {
  return [...skills.values()];
}

export function skillVersions(id: string, basePath: string): number[] {
  const skillDir = path.join(basePath, id);
  if (!fs.existsSync(skillDir)) return [];
  return fs.readdirSync(skillDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^v\d+$/.test(d.name))
    .map(d => parseInt(d.name.slice(1)))
    .sort();
}
