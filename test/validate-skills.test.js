import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_DIR = path.join(ROOT, "skills");
const pkg = JSON.parse(
  fs.readFileSync(path.join(ROOT, "package.json"), "utf8")
);

function parseFrontmatter(md) {
  const match = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error("Missing YAML frontmatter delimited by '---'");
  return yaml.load(match[1]);
}

const skillDirs = fs
  .readdirSync(SKILLS_DIR)
  .filter((d) => fs.statSync(path.join(SKILLS_DIR, d)).isDirectory());

describe("skill folders exist", () => {
  it("at least one skill is present", () => {
    expect(skillDirs.length).toBeGreaterThan(0);
  });
});

describe.each(skillDirs)("SKILL.md: %s", (dir) => {
  const skillPath = path.join(SKILLS_DIR, dir, "SKILL.md");
  const fm = parseFrontmatter(fs.readFileSync(skillPath, "utf8"));

  it("has a name field", () => {
    expect(fm.name).toBeTruthy();
  });

  it("name is lowercase and hyphenated (npx skills format)", () => {
    expect(fm.name).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it("name field matches folder name", () => {
    expect(fm.name).toBe(dir);
  });

  it("has a non-trivial description", () => {
    expect(typeof fm.description).toBe("string");
    expect(fm.description.length).toBeGreaterThan(10);
  });

  it("metadata.version matches package.json", () => {
    expect(fm.metadata?.version).toBe(pkg.version);
  });

  it("allowed-tools is a string when present", () => {
    if (fm["allowed-tools"] !== undefined) {
      expect(typeof fm["allowed-tools"]).toBe("string");
      expect(fm["allowed-tools"].length).toBeGreaterThan(0);
    }
  });
});
