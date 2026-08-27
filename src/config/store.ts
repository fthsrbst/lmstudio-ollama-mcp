import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ConfigSchema, DEFAULT_CONFIG, type ForgeConfig } from "./schema.js";
import { logger } from "../utils/logger.js";

const GLOBAL_CONFIG_PATH = path.join(os.homedir(), ".lmstudio-ollama-mcp", "config.json");
const LEGACY_GLOBAL_CONFIG_PATH = path.join(os.homedir(), ".forgecode", "config.json");
const PROJECT_CONFIG_NAMES = [
  "lmstudio-ollama-mcp.json",
  ".lmstudio-ollama-mcp.json",
  "forgecode.json",
  ".forgecode.json",
  "forge.json",
];

function readJsonIfExists(p: string): unknown | null {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

export function getGlobalConfigPath() {
  return GLOBAL_CONFIG_PATH;
}

export function findProjectConfig(startDir = process.cwd()): string | null {
  let dir = path.resolve(startDir);
  while (true) {
    for (const name of PROJECT_CONFIG_NAMES) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function loadConfig(cwd = process.cwd()): ForgeConfig {
  // prefer new path, fallback to legacy .forgecode for backward compat
  const globalRaw = readJsonIfExists(GLOBAL_CONFIG_PATH) ?? readJsonIfExists(LEGACY_GLOBAL_CONFIG_PATH);
  const projectPath = findProjectConfig(cwd);
  const projectRaw = projectPath ? readJsonIfExists(projectPath) : null;

  // shallow merge: project overrides global
  const merged = {
    ...DEFAULT_CONFIG,
    ...(globalRaw as object ?? {}),
    ...(projectRaw as object ?? {}),
    // deep merge providers/router/hardware if present
    providers: {
      ...DEFAULT_CONFIG.providers,
      ...((globalRaw as any)?.providers ?? {}),
      ...((projectRaw as any)?.providers ?? {}),
    },
    router: {
      ...DEFAULT_CONFIG.router,
      ...((globalRaw as any)?.router ?? {}),
      ...((projectRaw as any)?.router ?? {}),
    },
    hardware: {
      ...DEFAULT_CONFIG.hardware,
      ...((globalRaw as any)?.hardware ?? {}),
      ...((projectRaw as any)?.hardware ?? {}),
    },
  };

  // env overrides
  if (process.env.OPENAI_API_KEY && !merged.providers.openai) {
    merged.providers.openai = { type: "openai", baseUrl: "https://api.openai.com/v1", apiKey: process.env.OPENAI_API_KEY, enabled: true };
  }
  if (process.env.ANTHROPIC_API_KEY && !merged.providers.anthropic) {
    merged.providers.anthropic = { type: "anthropic", baseUrl: "https://api.anthropic.com", apiKey: process.env.ANTHROPIC_API_KEY, enabled: true };
  }

  const parsed = ConfigSchema.safeParse(merged);
  if (!parsed.success) {
    logger.warn("Invalid config, using defaults:", parsed.error.message);
    return DEFAULT_CONFIG;
  }
  return parsed.data;
}

export function saveGlobalConfig(patch: Partial<ForgeConfig>) {
  const current = loadConfig();
  const next = ConfigSchema.parse({ ...current, ...patch });
  fs.mkdirSync(path.dirname(GLOBAL_CONFIG_PATH), { recursive: true });
  fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(next, null, 2));
  return next;
}

export function saveProjectConfig(dir: string, patch: Partial<ForgeConfig>) {
  const file = path.join(path.resolve(dir), "lmstudio-ollama-mcp.json");
  const existing = readJsonIfExists(file) ?? {};
  const next = { ...(existing as object), ...patch };
  fs.writeFileSync(file, JSON.stringify(next, null, 2));
  return file;
}
