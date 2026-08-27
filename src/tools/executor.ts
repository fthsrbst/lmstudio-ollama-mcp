import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import fg from "fast-glob";
import { logger } from "../utils/logger.js";

const execAsync = promisify(exec);

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  tool_call_id: string;
  name: string;
  content: string;
  isError?: boolean;
}

export class ToolExecutor {
  constructor(
    private workspaceRoot: string,
    private opts: { allowBash: boolean; allowWriteOutsideWorkspace: boolean } = {
      allowBash: true,
      allowWriteOutsideWorkspace: false,
    },
  ) {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  private resolvePath(p: string): string {
    const abs = path.isAbsolute(p) ? p : path.join(this.workspaceRoot, p);
    const resolved = path.resolve(abs);
    if (!this.opts.allowWriteOutsideWorkspace) {
      if (!resolved.startsWith(this.workspaceRoot + path.sep) && resolved !== this.workspaceRoot) {
        throw new Error(`Path escapes workspace: ${p} -> ${resolved}`);
      }
    }
    return resolved;
  }

  async execute(call: ToolCall): Promise<ToolResult> {
    const start = Date.now();
    try {
      let content: string;
      switch (call.name) {
        case "read_file":
          content = await this.readFile(call.arguments.path);
          break;
        case "write_file":
          content = await this.writeFile(call.arguments.path, call.arguments.content);
          break;
        case "edit_file":
          content = await this.editFile(call.arguments.path, call.arguments.old_string, call.arguments.new_string);
          break;
        case "bash":
          if (!this.opts.allowBash) throw new Error("Bash tool disabled by config (permissions.allowBash=false)");
          content = await this.bash(call.arguments.command, call.arguments.timeout_ms);
          break;
        case "glob":
          content = await this.glob(call.arguments.pattern);
          break;
        case "grep":
          content = await this.grep(call.arguments.pattern, call.arguments.include);
          break;
        case "list_dir":
          content = await this.listDir(call.arguments.path ?? ".");
          break;
        default:
          throw new Error(`Unknown tool: ${call.name}`);
      }
      logger.debug(`[tool:${call.name}] ${Date.now() - start}ms`);
      return { tool_call_id: call.id, name: call.name, content: truncate(content, 30000) };
    } catch (e: any) {
      return { tool_call_id: call.id, name: call.name, content: `Error: ${e.message}`, isError: true };
    }
  }

  private async readFile(p: string): Promise<string> {
    const fp = this.resolvePath(p);
    if (!fs.existsSync(fp)) throw new Error(`File not found: ${p}`);
    const stat = fs.statSync(fp);
    if (stat.isDirectory()) throw new Error(`Path is directory, use list_dir: ${p}`);
    if (stat.size > 2 * 1024 * 1024) throw new Error(`File too large (${Math.round(stat.size / 1024)}KB), use grep/glob`);
    return fs.readFileSync(fp, "utf-8");
  }

  private async writeFile(p: string, content: string): Promise<string> {
    const fp = this.resolvePath(p);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, content, "utf-8");
    return `Wrote ${content.length} chars to ${p}`;
  }

  private async editFile(p: string, oldStr: string, newStr: string): Promise<string> {
    const fp = this.resolvePath(p);
    if (!fs.existsSync(fp)) throw new Error(`File not found: ${p}`);
    const cur = fs.readFileSync(fp, "utf-8");
    if (!cur.includes(oldStr)) throw new Error(`old_string not found in ${p}`);
    const occurrences = cur.split(oldStr).length - 1;
    if (occurrences > 1) throw new Error(`old_string appears ${occurrences} times in ${p}, be more specific`);
    fs.writeFileSync(fp, cur.replace(oldStr, newStr), "utf-8");
    return `Edited ${p} (replaced 1 occurrence)`;
  }

  private async bash(command: string, timeoutMs = 30000): Promise<string> {
    // basic safety: block destructive patterns if not explicitly allowed
    const dangerous = ["rm -rf /", "mkfs", ":(){:|:&};:"];
    if (dangerous.some((d) => command.includes(d))) throw new Error("Blocked dangerous command");
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.workspaceRoot,
        timeout: timeoutMs,
        maxBuffer: 5 * 1024 * 1024,
        env: { ...process.env, FORCE_COLOR: "0" },
      });
      const out = [stdout, stderr].filter(Boolean).join("\n");
      return out || "(no output)";
    } catch (e: any) {
      const out = [e.stdout, e.stderr].filter(Boolean).join("\n");
      throw new Error(out || e.message);
    }
  }

  private async glob(pattern: string): Promise<string> {
    const entries = await fg(pattern, { cwd: this.workspaceRoot, dot: false, onlyFiles: true });
    if (!entries.length) return "(no matches)";
    return entries.slice(0, 200).join("\n") + (entries.length > 200 ? `\n... +${entries.length - 200} more` : "");
  }

  private async grep(pattern: string, include?: string): Promise<string> {
    const files = await fg(include ?? "**/*", {
      cwd: this.workspaceRoot,
      onlyFiles: true,
      ignore: ["node_modules/**", "dist/**", ".git/**", "coverage/**"],
    });
    const re = new RegExp(pattern, "m");
    const hits: string[] = [];
    for (const f of files.slice(0, 2000)) {
      try {
        const content = fs.readFileSync(path.join(this.workspaceRoot, f), "utf-8");
        const lines = content.split("\n");
        lines.forEach((line, i) => {
          if (re.test(line)) {
            hits.push(`${f}:${i + 1}: ${line.slice(0, 300)}`);
            if (hits.length >= 100) return;
          }
        });
        if (hits.length >= 100) break;
      } catch {}
    }
    if (!hits.length) return "(no matches)";
    return hits.join("\n");
  }

  private async listDir(p: string): Promise<string> {
    const fp = this.resolvePath(p);
    if (!fs.existsSync(fp)) throw new Error(`Directory not found: ${p}`);
    const entries = fs.readdirSync(fp, { withFileTypes: true });
    return entries.map((e) => `${e.isDirectory() ? "📁 " : "📄 "}${e.name}`).join("\n") || "(empty)";
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n... truncated ${s.length - max} chars`;
}
