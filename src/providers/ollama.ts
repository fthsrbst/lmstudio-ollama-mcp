import { OpenAICompatibleProvider } from "./openai-compatible.js";
import type { ModelInfo } from "./base.js";

export class OllamaProvider extends OpenAICompatibleProvider {
  private nativeBase: string;
  constructor(baseUrl = "http://localhost:11434") {
    // Ollama now supports OpenAI-compat at /v1
    const v1 = baseUrl.replace(/\/$/, "") + "/v1";
    super({ id: "ollama", displayName: "Ollama", baseUrl: v1 });
    this.nativeBase = baseUrl.replace(/\/$/, "");
  }

  override async isAvailable(): Promise<boolean> {
    try {
      const r = await fetch(`${this.nativeBase}/api/tags`, { signal: AbortSignal.timeout(1500) });
      return r.ok;
    } catch {
      return super.isAvailable();
    }
  }

  override async listModels(): Promise<ModelInfo[]> {
    // Try native first for richer metadata
    try {
      const r = await fetch(`${this.nativeBase}/api/tags`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) {
        const j: any = await r.json();
        const models: any[] = j.models ?? [];
        if (models.length) {
          return models.map((m) => ({
            id: m.name,
            name: m.name,
            provider: "ollama",
            sizeBytes: m.size,
            contextLength: m.details?.parameter_size ? undefined : undefined,
            quantization: m.details?.quantization_level,
            capabilities: m.details?.capabilities,
          }));
        }
      }
    } catch {}
    // Fallback to OpenAI-compatible
    try {
      return await super.listModels();
    } catch {
      return [];
    }
  }

  /** Ollama-specific: ensure model is pulled */
  async pullModel(model: string, onProgress?: (msg: string) => void): Promise<void> {
    const r = await fetch(`${this.nativeBase}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model }),
    });
    if (!r.ok || !r.body) throw new Error(`Failed to pull ${model}: ${r.statusText}`);
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      for (const line of chunk.split("\n").filter(Boolean)) {
        try {
          const j = JSON.parse(line);
          if (j.status && onProgress) onProgress(j.status);
        } catch {}
      }
    }
  }
}
