import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scanProject } from "../server/core/project-scanner.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-deck-scan-"));

after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("scanProject", () => {
  it("refuses to scan the filesystem root", async () => {
    await assert.rejects(scanProject(path.parse(process.cwd()).root), /filesystem root/);
  });

  it("scans a project directory", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "demo-app", dependencies: { react: "^19.0.0" } })
    );
    fs.mkdirSync(path.join(tmpDir, "src"));
    fs.writeFileSync(path.join(tmpDir, "src", "index.ts"), "export {};\n");

    const project = await scanProject(tmpDir);
    assert.equal(project.name, "demo-app");
    assert.equal(project.root, tmpDir);
    assert.equal(project.language, "TypeScript");
  });
});
