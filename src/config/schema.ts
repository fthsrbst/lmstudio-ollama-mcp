import { z } from "zod";

export const ProviderConfigSchema = z.object({
  type: z.enum(["lmstudio", "ollama", "llamacpp", "openai", "anthropic"]),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  enabled: z.boolean().default(true),
});

export const ModelRuleSchema = z.object({
  pattern: z.string(),
  provider: z.string(),
  model: z.string(),
});

export const RouterConfigSchema = z.object({
  strategy: z.enum(["auto", "local-first", "frontier-first", "local-only"]).default("auto"),
  frontierProvider: z.string().optional(),
  frontierModel: z.string().optional(),
  localProvider: z.string().optional(),
  // task classification thresholds
  thresholds: z
    .object({
      smallTaskMaxTokens: z.number().default(2000),
      preferLocalFor: z.array(z.string()).default(["lint", "format", "test", "search", "summarize", "explain"]),
    })
    .default({}),
});

export const HardwareConfigSchema = z.object({
  maxParallelAgents: z.number().int().min(1).max(32).optional(), // auto if not set
  maxMemoryPerAgentMb: z.number().optional(),
  cpuOvercommit: z.number().min(0.5).max(2).default(1),
});

export const ConfigSchema = z.object({
  version: z.number().default(1),
  providers: z.record(ProviderConfigSchema).default({}),
  router: RouterConfigSchema.default({ strategy: "auto" }),
  hardware: HardwareConfigSchema.default({}),
  models: z
    .object({
      default: z.string().optional(),
      rules: z.array(ModelRuleSchema).default([]),
    })
    .default({}),
  permissions: z
    .object({
      allowBash: z.boolean().default(true),
      allowWriteOutsideWorkspace: z.boolean().default(false),
      allowNetwork: z.boolean().default(true),
    })
    .default({}),
});

export type ForgeConfig = z.infer<typeof ConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type RouterConfig = z.infer<typeof RouterConfigSchema>;

export const DEFAULT_CONFIG: ForgeConfig = ConfigSchema.parse({
  version: 1,
  providers: {
    lmstudio: { type: "lmstudio", baseUrl: "http://localhost:1234/v1", enabled: true },
    ollama: { type: "ollama", baseUrl: "http://localhost:11434", enabled: true },
    llamacpp: { type: "llamacpp", baseUrl: "http://localhost:8080", enabled: true },
  },
  router: {
    strategy: "auto",
    thresholds: { smallTaskMaxTokens: 2000, preferLocalFor: ["lint", "format", "test", "search", "summarize", "explain"] },
  },
  hardware: { cpuOvercommit: 1 },
  models: { rules: [] },
  permissions: { allowBash: true, allowWriteOutsideWorkspace: false, allowNetwork: true },
});
