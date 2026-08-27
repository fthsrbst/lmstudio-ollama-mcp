import { describe, it, expect } from "vitest";
import { LMStudioProvider } from "../src/providers/lmstudio.js";
import { OllamaProvider } from "../src/providers/ollama.js";
import { LlamaCppProvider } from "../src/providers/llamacpp.js";

describe("providers", () => {
  it("LMStudio provider has correct id", () => {
    const p = new LMStudioProvider();
    expect(p.id).toBe("lmstudio");
    expect(p.defaultBaseUrl).toContain("1234");
  });
  it("Ollama provider has correct id and native base", () => {
    const p = new OllamaProvider();
    expect(p.id).toBe("ollama");
    expect(p.defaultBaseUrl).toContain("11434");
  });
  it("llamacpp provider has correct id", () => {
    const p = new LlamaCppProvider();
    expect(p.id).toBe("llamacpp");
    expect(p.defaultBaseUrl).toContain("8080");
  });
  it("isAvailable returns boolean", async () => {
    const p = new LMStudioProvider("http://localhost:59999/v1");
    const avail = await p.isAvailable();
    expect(typeof avail).toBe("boolean");
  });
});
