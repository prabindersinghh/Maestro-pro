// Skills — ported from Agent/Skills/{Skill,SkillCatalog,SkillStore}.swift. A skill is a SKILL.md
// (YAML-ish frontmatter: name, description; + a markdown body of workflow instructions). The
// catalog + bodies are fetched from the SAME public repo Palmier uses (palmier-io/palmier-skills),
// overridable via MAESTRO_SKILLS_BASE / PALMIER_SKILLS_BASE (e.g. file:///path for a local clone).
// read_skill(id) returns a skill's body so Claude can follow pro editing workflows step by step.

export interface SkillEntry {
  id: string;
  name: string;
  description: string;
  sha: string;
  path: string;
}

const BASE = process.env.MAESTRO_SKILLS_BASE ?? process.env.PALMIER_SKILLS_BASE ?? "https://raw.githubusercontent.com/palmier-io/palmier-skills/main";

// SkillFrontmatter.parse (Skill.swift): split leading --- frontmatter from the body.
export function parseFrontmatter(text: string): { fields: Record<string, string>; body: string } {
  const lines = text.split("\n");
  const fields: Record<string, string> = {};
  if (lines[0]?.trim() !== "---") return { fields, body: text };
  let i = 1;
  for (; i < lines.length && lines[i].trim() !== "---"; i++) {
    const colon = lines[i].indexOf(":");
    if (colon < 0) continue;
    const key = lines[i].slice(0, colon).trim();
    let value = lines[i].slice(colon + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (key) fields[key] = value;
  }
  const body = i + 1 < lines.length ? lines.slice(i + 1).join("\n").trim() : "";
  return { fields, body };
}

export class SkillStore {
  private catalogCache: SkillEntry[] | null = null;
  private bodyCache = new Map<string, string>();

  private async fetchText(url: string): Promise<string> {
    if (url.startsWith("file://")) {
      const { readFile } = await import("node:fs/promises");
      const { fileURLToPath } = await import("node:url");
      return readFile(fileURLToPath(url), "utf8");
    }
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.text();
  }

  async catalog(): Promise<SkillEntry[]> {
    if (this.catalogCache) return this.catalogCache;
    try {
      const entries = JSON.parse(await this.fetchText(`${BASE}/catalog.json`)) as SkillEntry[];
      this.catalogCache = entries;
      return entries;
    } catch {
      return [];
    }
  }

  /** A skill's body (post-frontmatter workflow). null if unknown. */
  async body(id: string): Promise<string | null> {
    const hit = this.bodyCache.get(id);
    if (hit !== undefined) return hit;
    const entry = (await this.catalog()).find((e) => e.id === id);
    if (!entry) return null;
    try {
      const raw = await this.fetchText(`${BASE}/${entry.path}`);
      const { body } = parseFrontmatter(raw);
      const text = body || raw;
      this.bodyCache.set(id, text);
      return text;
    } catch {
      return null;
    }
  }

  /** Catalog block for the MCP server instructions (SkillStore.promptBlock). */
  async promptBlock(): Promise<string> {
    const entries = await this.catalog();
    if (entries.length === 0) return "";
    const list = entries.map((e) => `- ${e.id}: ${e.description}`).join("\n");
    return [
      "## Skills (editing playbooks)",
      "Before a task that matches one of these, call read_skill(id) to load its step-by-step workflow, then follow it. Generation-related skills assume a generation backend (see list_models).",
      list,
    ].join("\n");
  }
}
