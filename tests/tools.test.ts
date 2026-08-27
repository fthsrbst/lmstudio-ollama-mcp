import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ToolExecutor } from "../src/tools/executor.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-tools-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("ToolExecutor", () => {
  it("writes and reads files", async () => {
    const ex = new ToolExecutor(tmpDir);
    const w = await ex.execute({ id: "1", name: "write_file", arguments: { path: "hello.txt", content: "hello forge" } });
    expect(w.content).toContain("Wrote");
    const r = await ex.execute({ id: "2", name: "read_file", arguments: { path: "hello.txt" } });
    expect(r.content).toBe("hello forge");
  });

  it("edits files", async () => {
    const ex = new ToolExecutor(tmpDir);
    await ex.execute({ id: "1", name: "write_file", arguments: { path: "a.ts", content: "const x = 1;" } });
    const e = await ex.execute({ id: "2", name: "edit_file", arguments: { path: "a.ts", old_string: "const x = 1;", new_string: "const x = 2;" } });
    expect(e.content).toContain("Edited");
    const r = await ex.execute({ id: "3", name: "read_file", arguments: { path: "a.ts" } });
    expect(r.content).toBe("const x = 2;");
  });

  it("blocks path escape", async () => {
    const ex = new ToolExecutor(tmpDir, { allowBash: true, allowWriteOutsideWorkspace: false });
    const res = await ex.execute({ id: "1", name: "write_file", arguments: { path: "../escape.txt", content: "bad" } });
    expect(res.isError).toBe(true);
    expect(res.content).toContain("escapes workspace");
  });

  it("glob finds files", async () => {
    const ex = new ToolExecutor(tmpDir);
    await ex.execute({ id: "1", name: "write_file", arguments: { path: "src/a.ts", content: "" } });
    await ex.execute({ id: "2", name: "write_file", arguments: { path: "src/b.ts", content: "" } });
    const g = await ex.execute({ id: "3", name: "glob", arguments: { pattern: "src/**/*.ts" } });
    expect(g.content).toContain("src/a.ts");
    expect(g.content).toContain("src/b.ts");
  });

  it("grep searches content", async () => {
    const ex = new ToolExecutor(tmpDir);
    await ex.execute({ id: "1", name: "write_file", arguments: { path: "app.ts", content: "function hello() {}\nfunction world() {}" } });
    const g = await ex.execute({ id: "2", name: "grep", arguments: { pattern: "hello" } });
    expect(g.content).toContain("app.ts");
    expect(g.content).toContain("hello");
  });

  it("bash runs commands", async () => {
    const ex = new ToolExecutor(tmpDir);
    const r = await ex.execute({ id: "1", name: "bash", arguments: { command: "echo hello" } });
    expect(r.content.trim()).toBe("hello");
  });

  it("bash respects allowBash=false", async () => {
    const ex = new ToolExecutor(tmpDir, { allowBash: false, allowWriteOutsideWorkspace: false });
    const r = await ex.execute({ id: "1", name: "bash", arguments: { command: "echo hi" } });
    expect(r.isError).toBe(true);
  });

  it("list_dir works", async () => {
    const ex = new ToolExecutor(tmpDir);
    await ex.execute({ id: "1", name: "write_file", arguments: { path: "x.txt", content: "hi" } });
    const l = await ex.execute({ id: "2", name: "list_dir", arguments: { path: "." } });
    expect(l.content).toContain("x.txt");
  });
});
