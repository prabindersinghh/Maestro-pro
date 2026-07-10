import { describe, it, expect } from "vitest";
import { McpExecutor } from "../executor";

// The SkillStore is local-first: with ./skills/catalog.json present (cwd = project root during tests),
// list_skills/read_skill serve Maestro's own bundled playbooks.
describe("bundled skill library (local-first)", () => {
  it("list_skills returns Maestro's own reel/creative skills", async () => {
    const ex = new McpExecutor();
    const r = await ex.execute("list_skills", {});
    const { skills } = JSON.parse(r.content[0].text) as { skills: { id: string }[] };
    const ids = skills.map((s) => s.id);
    for (const id of ["build-in-maestro", "viral-reel", "beat-sync-cutting", "creative-director", "caption-styles", "broll-planner"]) {
      expect(ids).toContain(id);
    }
  });

  it("the house-rule skill forbids standalone renders and requires Maestro's Export", async () => {
    const ex = new McpExecutor();
    const r = await ex.execute("read_skill", { id: "build-in-maestro" });
    expect(r.isError).toBeFalsy();
    const body = r.content[0].text;
    expect(body).toMatch(/never render a standalone|NEVER|Never render/i);
    expect(body).toContain("export_project");
  });

  it("read_skill loads a playbook body that references real tools", async () => {
    const ex = new McpExecutor();
    const r = await ex.execute("read_skill", { id: "viral-reel" });
    expect(r.isError).toBeFalsy();
    const body = r.content[0].text;
    expect(body).toContain("9:16");
    expect(body).toMatch(/set_project_settings|split_clips|set_keyframes|add_texts/); // wired to tools
  });

  it("unknown skill id errors clearly", async () => {
    const ex = new McpExecutor();
    const r = await ex.execute("read_skill", { id: "does-not-exist" });
    expect(r.isError).toBe(true);
  });
});
