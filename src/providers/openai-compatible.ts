import OpenAI from "openai";
import type { Provider, ChatOptions, ChatResponse, ModelInfo } from "./base.js";
import { ProviderError, toChatResponse } from "./base.js";

export interface OpenAICompatibleConfig {
  id: string;
  displayName: string;
  baseUrl: string;
  apiKey?: string;
  defaultHeaders?: Record<string, string>;
}

export class OpenAICompatibleProvider implements Provider {
  readonly id: string;
  readonly displayName: string;
  readonly defaultBaseUrl: string;
  private client: OpenAI;

  constructor(private cfg: OpenAICompatibleConfig) {
    this.id = cfg.id;
    this.displayName = cfg.displayName;
    this.defaultBaseUrl = cfg.baseUrl;
    this.client = new OpenAI({
      baseURL: cfg.baseUrl,
      apiKey: cfg.apiKey || "not-needed",
      defaultHeaders: cfg.defaultHeaders,
      dangerouslyAllowBrowser: false,
    });
  }

  async isAvailable(): Promise<boolean> {
    try {
      const r = await fetch(`${this.cfg.baseUrl.replace(/\/v1\/?$/, "")}/v1/models`, {
        headers: this.cfg.apiKey ? { Authorization: `Bearer ${this.cfg.apiKey}` } : {},
        signal: AbortSignal.timeout(2000),
      });
      return r.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const list = await this.client.models.list();
      return (list.data as any[]).map((m) => ({
        id: m.id,
        name: m.id,
        provider: this.id,
      }));
    } catch (e: any) {
      throw new ProviderError(`Failed to list models from ${this.id}: ${e.message}`, this.id, undefined, e);
    }
  }

  async chat(opts: ChatOptions): Promise<ChatResponse> {
    try {
      const res = await this.client.chat.completions.create({
        model: opts.model,
        messages: opts.messages as any,
        tools: opts.tools as any,
        tool_choice: opts.tool_choice as any,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.max_tokens ?? 2048,
        stream: false,
      } as any);
      return toChatResponse(res, this.id);
    } catch (e: any) {
      const status = e.status ?? e.statusCode;
      throw new ProviderError(`Chat failed on ${this.id}/${opts.model}: ${e.message}`, this.id, status, e);
    }
  }

  async chatStream(opts: ChatOptions, onChunk: (c: string) => void): Promise<ChatResponse> {
    const stream = await this.client.chat.completions.create({
      model: opts.model,
      messages: opts.messages as any,
      tools: opts.tools as any,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.max_tokens,
      stream: true,
    } as any);

    let full = "";
    let id = "";
    let model = opts.model;
    for await (const chunk of stream as any) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        full += delta;
        onChunk(delta);
      }
      if (chunk.id) id = chunk.id;
      if (chunk.model) model = chunk.model;
    }
    return { id: id || `chat-${Date.now()}`, model, provider: this.id, content: full };
  }
}
