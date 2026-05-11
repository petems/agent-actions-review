import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(
  fs.readFileSync(path.join(ROOT, "package.json"), "utf8")
);
const plugin = JSON.parse(
  fs.readFileSync(path.join(ROOT, ".claude-plugin/plugin.json"), "utf8")
);
const market = JSON.parse(
  fs.readFileSync(path.join(ROOT, ".claude-plugin/marketplace.json"), "utf8")
);
const skillDirs = fs
  .readdirSync(path.join(ROOT, "skills"))
  .filter((d) => fs.statSync(path.join(ROOT, "skills", d)).isDirectory());

describe(".claude-plugin/plugin.json", () => {
  it("has a name", () => {
    expect(plugin.name).toBeTruthy();
  });

  it("name matches package.json", () => {
    expect(plugin.name).toBe(pkg.name);
  });

  it("version matches package.json", () => {
    expect(plugin.version).toBe(pkg.version);
  });

  it("has a non-trivial description", () => {
    expect(typeof plugin.description).toBe("string");
    expect(plugin.description.length).toBeGreaterThan(10);
  });

  it("declares a license", () => {
    expect(plugin.license).toBeTruthy();
  });
});

describe(".claude-plugin/marketplace.json", () => {
  it("has a name", () => {
    expect(market.name).toBeTruthy();
  });

  it("has owner.name", () => {
    expect(market.owner?.name).toBeTruthy();
  });

  it("plugins is a non-empty array", () => {
    expect(Array.isArray(market.plugins)).toBe(true);
    expect(market.plugins.length).toBeGreaterThan(0);
  });

  it("every plugin entry has name, source, and description", () => {
    for (const entry of market.plugins) {
      expect(entry.name, `plugin entry missing name: ${JSON.stringify(entry)}`).toBeTruthy();
      expect(entry.source, `plugin entry missing source: ${entry.name}`).toBeTruthy();
      expect(typeof entry.description).toBe("string");
      expect(entry.description.length).toBeGreaterThan(10);
    }
  });

  it("plugin names are unique", () => {
    const names = market.plugins.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every skill folder is listed in marketplace.json", () => {
    const listed = new Set(market.plugins.map((p) => p.name));
    for (const dir of skillDirs) {
      expect(listed.has(dir), `skill folder '${dir}' not listed in marketplace.json`).toBe(true);
    }
  });

  it("every marketplace entry maps to a real skill folder", () => {
    const dirs = new Set(skillDirs);
    for (const entry of market.plugins) {
      expect(dirs.has(entry.name), `marketplace entry '${entry.name}' has no matching skills/ folder`).toBe(true);
    }
  });
});
