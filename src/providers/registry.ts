import type { Provider, ModelInfo } from "./base.js";
import { LMStudioProvider } from "./lmstudio.js";
import { OllamaProvider } from "./ollama.js";
import { LlamaCppProvider } from "./llamacpp.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";
import type { ForgeConfig } from "../config/schema.js";

export class ProviderRegistry {
  private providers = new Map<string, Provider>();

  constructor(private config: ForgeConfig) {
    this.initFromConfig();
  }

  private initFromConfig() {
    for (const [key, p] of Object.entries(this.config.providers)) {
      if (p.enabled === false) continue;
      let provider: Provider | null = null;
      switch (p.type) {
        case "lmstudio":
          provider = new LMStudioProvider(p.baseUrl ?? "http://localhost:1234/v1", p.apiKey);
          break;
        case "ollama":
          provider = new OllamaProvider(p.baseUrl ?? "http://localhost:11434");
          break;
        case "llamacpp":
          provider = new LlamaCppProvider(p.baseUrl ?? "http://localhost:8080");
          break;
        case "openai":
          provider = new OpenAICompatibleProvider({
            id: key,
            displayName: key === "openai" ? "OpenAI" : key,
            baseUrl: p.baseUrl ?? "https://api.openai.com/v1",
            apiKey: p.apiKey,
          });
          break;
        case "anthropic":
          // Anthropic via OpenAI-compat shim or native — use OpenAI compat if baseUrl provided
          provider = new OpenAICompatibleProvider({
            id: key,
            displayName: "Anthropic",
            baseUrl: p.baseUrl ?? "https://api.anthropic.com/v1",
            apiKey: p.apiKey,
          });
          break;
      }
      if (provider) this.providers.set(provider.id, provider);
    }
  }

  get(id: string): Provider | undefined {
    return this.providers.get(id);
  }

  all(): Provider[] {
    return [...this.providers.values()];
  }

  async listAvailable(): Promise<Array<{ provider: Provider; available: boolean }>> {
    const results = await Promise.all(
      this.all().map(async (p) => ({ provider: p, available: await p.isAvailable().catch(() => false) })),
    );
    return results;
  }

  async listAllModels(): Promise<ModelInfo[]> {
    const avail = (await this.listAvailable()).filter((x) => x.available).map((x) => x.provider);
    const lists = await Promise.allSettled(avail.map((p) => p.listModels()));
    const models: ModelInfo[] = [];
    for (const r of lists) if (r.status === "fulfilled") models.push(...r.value);
    return models;
  }

  /** pick best available local provider */
  async getLocalProvider(): Promise<Provider | null> {
    const order = ["lmstudio", "ollama", "llamacpp"];
    for (const id of order) {
      const p = this.get(id);
      if (p && (await p.isAvailable().catch(() => false))) return p;
    }
    // any local-ish
    for (const p of this.all()) {
      if (["lmstudio", "ollama", "llamacpp"].includes(p.id) && (await p.isAvailable().catch(() => false))) return p;
    }
    return null;
  }

  getFrontierProvider(): Provider | null {
    const id = this.config.router.frontierProvider ?? "openai";
    const p = this.get(id);
    if (p) return p;
    // fallback: find any non-local
    for (const prov of this.all()) {
      if (!["lmstudio", "ollama", "llamacpp"].includes(prov.id)) return prov;
    }
    return null;
  }
}
