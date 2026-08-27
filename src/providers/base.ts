export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  tool_choice?: "auto" | "none" | { type: "function"; function: { name: string } };
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  stop?: string[];
}

export interface ChatUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatResponse {
  id: string;
  model: string;
  provider: string;
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  usage?: ChatUsage;
  raw?: unknown;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextLength?: number;
  sizeBytes?: number;
  quantization?: string;
  capabilities?: string[];
}

export interface Provider {
  readonly id: string;
  readonly displayName: string;
  readonly defaultBaseUrl: string;
  isAvailable(): Promise<boolean>;
  listModels(): Promise<ModelInfo[]>;
  chat(opts: ChatOptions): Promise<ChatResponse>;
  // optional streaming
  chatStream?(opts: ChatOptions, onChunk: (chunk: string) => void): Promise<ChatResponse>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public provider: string,
    public statusCode?: number,
    public cause?: unknown,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** normalize OpenAI-style response to ChatResponse */
export function toChatResponse(raw: any, providerId: string): ChatResponse {
  const choice = raw.choices?.[0];
  const msg = choice?.message ?? {};
  // Some local models (Gemma, Qwen) put reasoning in reasoning_content; fallback if content empty
  let content: string | null = msg.content ?? null;
  if ((!content || content.trim() === "") && typeof msg.reasoning_content === "string" && msg.reasoning_content.trim()) {
    // Only fallback if not a tool-call turn (tool_calls present means reasoning is internal)
    if (!msg.tool_calls || msg.tool_calls.length === 0) content = msg.reasoning_content;
  }
  return {
    id: raw.id ?? `chat-${Date.now()}`,
    model: raw.model ?? "unknown",
    provider: providerId,
    content,
    tool_calls: msg.tool_calls,
    usage: raw.usage,
    raw,
  };
}
