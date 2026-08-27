import { OpenAICompatibleProvider } from "./openai-compatible.js";

export class LlamaCppProvider extends OpenAICompatibleProvider {
  constructor(baseUrl = "http://localhost:8080") {
    // llama.cpp server exposes OpenAI-compat at /v1
    const v1 = baseUrl.replace(/\/$/, "") + "/v1";
    super({ id: "llamacpp", displayName: "llama.cpp", baseUrl: v1 });
  }

  override async isAvailable(): Promise<boolean> {
    try {
      const base = this.defaultBaseUrl.replace(/\/v1\/?$/, "");
      const checks = await Promise.allSettled([
        fetch(`${base}/health`, { signal: AbortSignal.timeout(1000) }).then((r) => r.ok),
        fetch(`${base}/v1/models`, { signal: AbortSignal.timeout(1000) }).then((r) => r.ok),
      ]);
      return checks.some((c) => c.status === "fulfilled" && c.value);
    } catch {
      return false;
    }
  }
}
