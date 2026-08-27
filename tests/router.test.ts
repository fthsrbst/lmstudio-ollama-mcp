import { describe, it, expect, vi } from "vitest";
import { ModelRouter } from "../src/providers/router.js";
import type { Provider } from "../src/providers/base.js";

function mockProvider(id: string, available = true, models: string[] = ["test-model"]): Provider {
  return {
    id,
    displayName: id,
    defaultBaseUrl: "http://localhost:0",
    isAvailable: async () => available,
    listModels: async () => models.map((m) => ({ id: m, name: m, provider: id })),
    chat: async () => ({ id: "1", model: models[0]!, provider: id, content: "ok" }),
  } as Provider;
}

function makeRegistry(local: Provider | null, frontier: Provider | null) {
  const map = new Map<string, Provider>();
  if (local) map.set(local.id, local);
  if (frontier) map.set(frontier.id, frontier);
  // add others for getAvailable etc
  return {
    get: (id: string) => map.get(id),
    all: () => [...map.values()],
    listAvailable: async () => [...map.values()].map((p) => ({ provider: p, available: true })),
    listAllModels: async () => {
      const out: any[] = [];
      for (const p of map.values()) {
        const ms = await p.listModels();
        out.push(...ms);
      }
      return out;
    },
    getLocalProvider: async () => local,
    getFrontierProvider: () => frontier,
  } as any;
}

describe("ModelRouter", () => {
  it("classifies trivial vs large", () => {
    const r = new ModelRouter(makeRegistry(null, null) as any, { router: { strategy: "auto", thresholds: { smallTaskMaxTokens: 2000, preferLocalFor: [] } } } as any);
    expect(r.classifyTask("hi")).toBe("trivial");
    expect(r.classifyTask("a".repeat(30000))).toBe("large");
  });

  it("routes small to local in auto", async () => {
    const local = mockProvider("lmstudio");
    const frontier = mockProvider("openai");
    const registry = makeRegistry(local, frontier);
    const router = new ModelRouter(registry, { router: { strategy: "auto", thresholds: { smallTaskMaxTokens: 2000, preferLocalFor: [] } } } as any);
    const d = await router.route("fix typo", { kind: "lint" });
    // lint is preferLocalFor? not in this config, but small size -> local
    expect(d.provider.id).toBe("lmstudio");
  });

  it("routes large to frontier when available", async () => {
    const local = mockProvider("lmstudio");
    const frontier = mockProvider("openai");
    const registry = makeRegistry(local, frontier);
    const router = new ModelRouter(registry, { router: { strategy: "auto", thresholds: { smallTaskMaxTokens: 500, preferLocalFor: [] } } } as any);
    const d = await router.route("a".repeat(8000));
    expect(d.provider.id).toBe("openai");
  });

  it("local-only always uses local", async () => {
    const local = mockProvider("ollama");
    const frontier = mockProvider("openai");
    const registry = makeRegistry(local, frontier);
    const router = new ModelRouter(registry, { router: { strategy: "local-only", thresholds: { smallTaskMaxTokens: 2000, preferLocalFor: [] } } } as any);
    const d = await router.route("a".repeat(20000));
    expect(d.provider.id).toBe("ollama");
  });

  it("throws if no providers", async () => {
    const registry = makeRegistry(null, null);
    const router = new ModelRouter(registry, { router: { strategy: "auto", thresholds: { smallTaskMaxTokens: 2000, preferLocalFor: [] } } } as any);
    await expect(router.route("hello")).rejects.toThrow();
  });
});
