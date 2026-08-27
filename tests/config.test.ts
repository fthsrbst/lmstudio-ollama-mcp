import { describe, it, expect } from "vitest";
import { ConfigSchema, DEFAULT_CONFIG } from "../src/config/schema.js";

describe("config schema", () => {
  it("parses default", () => {
    const c = ConfigSchema.parse({});
    expect(c.version).toBe(1);
    expect(c.providers).toBeDefined();
    // DEFAULT_CONFIG has prefilled providers
    expect(DEFAULT_CONFIG.providers.lmstudio).toBeDefined();
  });

  it("default config is valid", () => {
    expect(() => ConfigSchema.parse(DEFAULT_CONFIG)).not.toThrow();
  });

  it("allows overriding strategy", () => {
    const c = ConfigSchema.parse({ router: { strategy: "local-only" } });
    expect(c.router.strategy).toBe("local-only");
  });
});
