import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { OpenAICompatibleProvider } from "./openai-compatible.js";
import type { ModelInfo } from "./base.js";

export class LMStudioProvider extends OpenAICompatibleProvider {
  constructor(baseUrl = "http://localhost:1234/v1", apiKey?: string) {
    super({ id: "lmstudio", displayName: "LM Studio", baseUrl, apiKey });
  }

  override async isAvailable(): Promise<boolean> {
    // LM Studio exposes /v1/models on 1234
    try {
      const url = this.defaultBaseUrl.replace(/\/v1\/?$/, "") + "/v1/models";
      const r = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (r.ok) return true;
    } catch {}
    // Fallback: check local models dir exists
    const lmDir = path.join(os.homedir(), ".lmstudio", "models");
    try {
      return fs.existsSync(lmDir) && fs.readdirSync(lmDir).length > 0;
    } catch {
      return false;
    }
  }

  override async listModels(): Promise<ModelInfo[]> {
    try {
      return await super.listModels();
    } catch {
      // fallback to filesystem scan
      return scanFilesystemModels();
    }
  }
}

function scanFilesystemModels(): ModelInfo[] {
  const roots = [
    path.join(os.homedir(), ".lmstudio", "models"),
    path.join(os.homedir(), ".cache", "lm-studio", "models"),
  ];
  const out: ModelInfo[] = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    // recursive find .gguf
    const walk = (dir: string) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p);
        else if (ent.name.endsWith(".gguf")) {
          const stat = fs.statSync(p);
          const rel = path.relative(root, p);
          out.push({
            id: rel.replace(/\\/g, "/"),
            name: ent.name.replace(".gguf", ""),
            provider: "lmstudio",
            sizeBytes: stat.size,
            quantization: ent.name.match(/Q\d+_\d+|IQ\d+_\w+|BF16|F16/i)?.[0],
          });
        }
      }
    };
    try {
      walk(root);
    } catch {}
  }
  return out;
}
