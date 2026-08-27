import type { Provider, ChatMessage, ToolDefinition } from "../providers/base.js";
import { ToolExecutor, type ToolCall } from "../tools/executor.js";
import { TOOL_DEFINITIONS } from "../tools/definitions.js";
import { logger } from "../utils/logger.js";

export interface AgentOptions {
  provider: Provider;
  model: string;
  workspaceRoot: string;
  systemPrompt?: string;
  tools?: ToolDefinition[];
  maxIterations?: number;
  temperature?: number;
  executor?: ToolExecutor;
}

export interface AgentEvent {
  type: "text" | "tool_call" | "tool_result" | "done" | "error";
  data: any;
}

export class Agent {
  private messages: ChatMessage[] = [];
  private executor: ToolExecutor;
  private tools: ToolDefinition[];
  private maxIterations: number;

  constructor(private opts: AgentOptions) {
    this.executor = opts.executor ?? new ToolExecutor(opts.workspaceRoot);
    this.tools = opts.tools ?? TOOL_DEFINITIONS;
    this.maxIterations = opts.maxIterations ?? 25;
    const sys = opts.systemPrompt ?? defaultSystemPrompt(opts.workspaceRoot);
    this.messages.push({ role: "system", content: sys });
  }

  get history(): ChatMessage[] {
    return [...this.messages];
  }

  async run(userMessage: string, onEvent?: (e: AgentEvent) => void): Promise<string> {
    this.messages.push({ role: "user", content: userMessage });

    let iterations = 0;
    let finalText = "";

    while (iterations < this.maxIterations) {
      iterations++;
      logger.debug(`[agent] iteration ${iterations} via ${this.opts.provider.id}/${this.opts.model}`);

      const res = await this.opts.provider.chat({
        model: this.opts.model,
        messages: this.messages,
        tools: this.tools,
        temperature: this.opts.temperature ?? 0.2,
      });

      // tool calls
      if (res.tool_calls && res.tool_calls.length > 0) {
        // push assistant message with tool calls
        this.messages.push({
          role: "assistant",
          content: res.content ?? "",
          // store tool_calls in raw? we keep text + will send tool results next
        } as any);
        // For OpenAI compat we need to preserve tool_calls in history properly
        // Patch: add raw tool_calls to last message for next iteration
        (this.messages[this.messages.length - 1] as any).tool_calls = res.tool_calls;

        for (const tc of res.tool_calls) {
          let args: Record<string, any> = {};
          try {
            args = JSON.parse(tc.function.arguments);
          } catch {
            args = { _raw: tc.function.arguments };
          }
          const call: ToolCall = { id: tc.id, name: tc.function.name, arguments: args };
          onEvent?.({ type: "tool_call", data: call });
          logger.step(`→ ${call.name}(${Object.keys(args).join(", ")})`);

          const result = await this.executor.execute(call);
          onEvent?.({ type: "tool_result", data: result });

          this.messages.push({
            role: "tool",
            content: result.content,
            tool_call_id: result.tool_call_id,
          });
        }
        continue;
      }

      // plain text response -> done
      const text = res.content ?? "";
      finalText = text;
      this.messages.push({ role: "assistant", content: text });
      onEvent?.({ type: "text", data: text });
      break;
    }

    if (iterations >= this.maxIterations) {
      const msg = `Reached max iterations (${this.maxIterations})`;
      onEvent?.({ type: "error", data: msg });
      finalText += `\n\n[forge: ${msg}]`;
    }

    onEvent?.({ type: "done", data: finalText });
    return finalText;
  }

  /** single-turn without tool loop, for sub-agent classification etc */
  async ask(prompt: string): Promise<string> {
    const res = await this.opts.provider.chat({
      model: this.opts.model,
      messages: [...this.messages, { role: "user", content: prompt }],
      temperature: 0.1,
    });
    return res.content ?? "";
  }
}

function defaultSystemPrompt(root: string): string {
  return `You are lmstudio-ollama-mcp — a local-first autonomous coding agent (Claude Code for LM Studio, Ollama & llama.cpp).

You run on the user's machine via LM Studio, Ollama or llama.cpp. You have tools to read, write, edit files, run bash, search codebase. Use them to complete tasks.

Rules:
- Workspace root: ${root}
- Be precise, minimal, no AI slop. Read files before editing. Prefer small, correct diffs.
- For multi-file tasks, explore first (glob/grep/read), then plan, then execute.
- Always verify with bash/tests when you change code. Don't assume.
- Keep answers concise. When you finish, summarize what you changed.
- If a task is too large, break it into steps but still attempt to complete end-to-end.

Tool use: call tools via function calling. You can call multiple tools per turn; they run sequentially.`;
}
