import type { Provider, ModelInfo } from "./base.js";
import type { ProviderRegistry } from "./registry.js";
import type { ForgeConfig } from "../config/schema.js";

export type TaskComplexity = "trivial" | "small" | "medium" | "large";

export interface RoutingDecision {
  provider: Provider;
  model: string;
  reason: string;
  complexity: TaskComplexity;
}

export class ModelRouter {
  constructor(
    private registry: ProviderRegistry,
    private config: ForgeConfig,
  ) {}

  classifyTask(prompt: string, opts?: { maxTokens?: number; kind?: string }): TaskComplexity {
    const kind = opts?.kind?.toLowerCase() ?? "";
    const preferLocal = this.config.router.thresholds?.preferLocalFor ?? [];
    if (kind && preferLocal.some((k) => kind.includes(k))) return "small";

    const len = prompt.length;
    const tokens = Math.ceil(len / 4);
    const maxT = opts?.maxTokens ?? this.config.router.thresholds?.smallTaskMaxTokens ?? 2000;

    if (tokens < 500 && prompt.split("\n").length < 10) return "trivial";
    if (tokens < maxT) return "small";
    if (tokens < maxT * 3) return "medium";
    return "large";
  }

  async route(prompt: string, opts?: { maxTokens?: number; kind?: string; preferredModel?: string }): Promise<RoutingDecision> {
    const strategy = this.config.router.strategy;
    const complexity = this.classifyTask(prompt, opts);

    if (opts?.preferredModel) {
      // try to resolve preferred model across providers
      const allModels = await this.registry.listAllModels();
      const found = allModels.find((m) => m.id === opts.preferredModel || m.name === opts.preferredModel);
      if (found) {
        const prov = this.registry.get(found.provider);
        if (prov) return { provider: prov, model: found.id, reason: `explicit model ${found.id}`, complexity };
      }
    }

    if (strategy === "local-only") {
      return this.routeLocal(complexity, "local-only");
    }
    if (strategy === "local-first") {
      if (complexity === "trivial" || complexity === "small") return this.routeLocal(complexity, "local-first small task");
      // medium/large -> try frontier else local
      const frontier = this.registry.getFrontierProvider();
      if (frontier && (await frontier.isAvailable().catch(() => false))) {
        const model = this.config.router.frontierModel ?? (await this.pickModel(frontier)) ?? "gpt-4o-mini";
        return { provider: frontier, model, reason: "frontier for medium/large task", complexity };
      }
      return this.routeLocal(complexity, "fallback local");
    }
    if (strategy === "frontier-first") {
      const frontier = this.registry.getFrontierProvider();
      if (frontier && (await frontier.isAvailable().catch(() => false))) {
        const model = this.config.router.frontierModel ?? (await this.pickModel(frontier)) ?? "gpt-4o-mini";
        return { provider: frontier, model, reason: "frontier-first", complexity };
      }
      return this.routeLocal(complexity, "frontier unavailable");
    }

    // auto: frontier plans, local executes small subtasks
    if (complexity === "trivial" || complexity === "small") {
      const local = await this.registry.getLocalProvider();
      if (local) {
        const m = (await this.pickModel(local)) ?? "local-model";
        return { provider: local, model: m, reason: `auto: ${complexity} -> local`, complexity };
      }
    }
    // medium/large -> prefer frontier if available
    const frontier = this.registry.getFrontierProvider();
    const local = await this.registry.getLocalProvider();
    if (frontier && (await frontier.isAvailable().catch(() => false))) {
      const m = this.config.router.frontierModel ?? (await this.pickModel(frontier)) ?? "gpt-4o-mini";
      return { provider: frontier, model: m, reason: `auto: ${complexity} -> frontier`, complexity };
    }
    if (local) {
      const m = (await this.pickModel(local)) ?? "local-model";
      return { provider: local, model: m, reason: `auto: ${complexity} -> local (frontier unavailable)`, complexity };
    }
    throw new Error("No providers available — configure LM Studio / Ollama or set frontier API keys");
  }

  private async routeLocal(complexity: TaskComplexity, reason: string): Promise<RoutingDecision> {
    const local = await this.registry.getLocalProvider();
    if (!local) throw new Error("No local provider available (LM Studio / Ollama / llama.cpp not detected)");
    const m = (await this.pickModel(local)) ?? "local-model";
    return { provider: local, model: m, reason, complexity };
  }

  private async pickModel(provider: Provider): Promise<string | null> {
    try {
      const models = await provider.listModels();
      if (!models.length) return null;
      // prefer instruct / chat models, smallest that fits
      // sort by name heuristic: prefer Q4, 7B, instruct
      const sorted = [...models].sort((a, b) => {
        const aScore = scoreModel(a);
        const bScore = scoreModel(b);
        return bScore - aScore;
      });
      return sorted[0]!.id;
    } catch {
      return null;
    }
  }
}

function scoreModel(m: ModelInfo): number {
  let s = 0;
  const id = m.id.toLowerCase();
  if (id.includes("instruct")) s += 10;
  if (id.includes("chat")) s += 5;
  if (id.includes("q4")) s += 3;
  if (id.includes("qwen")) s += 2;
  if (id.includes("gemma")) s += 2;
  if (id.includes("7b") || id.includes("8b")) s += 4;
  if (id.includes("12b")) s += 3;
  if (id.includes("27b") || id.includes("32b")) s += 1;
  // prefer smaller for speed when routing trivial tasks
  if (m.sizeBytes && m.sizeBytes < 5 * 1024 ** 3) s += 2;
  return s;
}
