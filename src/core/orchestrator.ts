import { Agent } from "./agent.js";
import { Scheduler } from "../hardware/scheduler.js";
import { ModelRouter } from "../providers/router.js";
import type { ProviderRegistry } from "../providers/registry.js";
import { ToolExecutor } from "../tools/executor.js";
import { logger } from "../utils/logger.js";
import type { ForgeConfig } from "../config/schema.js";
import type { Provider } from "../providers/base.js";

export interface SubTask {
  id: string;
  title: string;
  prompt: string;
  kind?: string; // for router classification
  dependsOn?: string[];
}

export interface OrchestratorOptions {
  workspaceRoot: string;
  config: ForgeConfig;
  registry: ProviderRegistry;
  router: ModelRouter;
  scheduler: Scheduler;
}

export interface OrchestratorResult {
  taskId: string;
  content: string;
  provider: string;
  model: string;
  durationMs: number;
  error?: string;
}

export class Orchestrator {
  constructor(private opts: OrchestratorOptions) {}

  /** Decompose a high-level goal into parallelizable subtasks using the frontier/local LLM */
  async decompose(goal: string, providerHint?: Provider, modelHint?: string): Promise<SubTask[]> {
    // heuristic fallback if no LLM available for planning
    const fallback = heuristicDecompose(goal);
    try {
      const plannerProvider =
        providerHint ?? this.opts.registry.getFrontierProvider() ?? (await this.opts.registry.getLocalProvider());
      if (!plannerProvider) return fallback;

      const plannerModel =
        modelHint ??
        this.opts.config.router.frontierModel ??
        (await plannerProvider.listModels().then((m) => m[0]?.id).catch(() => null)) ??
        "unknown";

      const agent = new Agent({
        provider: plannerProvider,
        model: plannerModel,
        workspaceRoot: this.opts.workspaceRoot,
        maxIterations: 1,
        temperature: 0.2,
        systemPrompt: `You are a task planner. Decompose the user's goal into 2-6 parallelizable sub-tasks.
Each sub-task must be independently executable by a coding sub-agent with file tools.
Return ONLY valid JSON array like:
[{"id":"t1","title":"...","prompt":"detailed prompt for subagent","kind":"code|test|docs|search"}]
No markdown, no explanation.`,
      });

      const raw = await agent.ask(`Goal: ${goal}\n\nWorkspace: ${this.opts.workspaceRoot}\nDecompose into parallel sub-tasks:`);
      const jsonStr = extractJsonArray(raw);
      if (!jsonStr) return fallback;
      const parsed = JSON.parse(jsonStr) as SubTask[];
      if (!Array.isArray(parsed) || parsed.length === 0) return fallback;
      // normalize
      return parsed
        .filter((t) => t.prompt && t.title)
        .map((t, i) => ({ id: t.id || `t${i + 1}`, title: t.title, prompt: t.prompt, kind: t.kind }));
    } catch (e) {
      logger.warn("Decompose failed, using heuristic:", (e as Error).message);
      return fallback;
    }
  }

  /** Execute subtasks in parallel with hardware-aware scheduling + intelligent routing */
  async executeParallel(
    goal: string,
    subtasks: SubTask[],
    onProgress?: (ev: { task: SubTask; status: "start" | "done" | "error"; result?: OrchestratorResult }) => void,
  ): Promise<OrchestratorResult[]> {
    // topological simple: respect dependsOn by batching
    const batches = batchByDependencies(subtasks);
    const allResults: OrchestratorResult[] = [];

    for (const batch of batches) {
      logger.info(`Executing batch of ${batch.length} parallel sub-agents (${this.opts.scheduler.describe()})`);

      const tasks = batch.map((sub) => async () => {
        onProgress?.({ task: sub, status: "start" });
        const start = Date.now();
        try {
          // route each subtask intelligently: small -> local, large -> frontier
          const decision = await this.opts.router.route(sub.prompt, { kind: sub.kind }).catch(async () => {
            const local = await this.opts.registry.getLocalProvider();
            if (!local) throw new Error("No provider for subtask");
            const m = await local.listModels().then((mm) => mm[0]?.id ?? "local-model");
            return { provider: local, model: m, reason: "fallback", complexity: "small" as const };
          });

          logger.info(`[sub:${sub.id}] ${sub.title} -> ${decision.provider.id}/${decision.model} (${decision.reason})`);

          const executor = new ToolExecutor(this.opts.workspaceRoot, {
            allowBash: this.opts.config.permissions.allowBash,
            allowWriteOutsideWorkspace: this.opts.config.permissions.allowWriteOutsideWorkspace,
          });

          const agent = new Agent({
            provider: decision.provider,
            model: decision.model,
            workspaceRoot: this.opts.workspaceRoot,
            executor,
            maxIterations: 18,
            temperature: 0.2,
          });

          const content = await agent.run(sub.prompt, (ev) => {
            if (ev.type === "tool_call") logger.debug(`[sub:${sub.id}] tool ${ev.data.name}`);
          });

          const res: OrchestratorResult = {
            taskId: sub.id,
            content,
            provider: decision.provider.id,
            model: decision.model,
            durationMs: Date.now() - start,
          };
          onProgress?.({ task: sub, status: "done", result: res });
          return res;
        } catch (e: any) {
          const res: OrchestratorResult = {
            taskId: sub.id,
            content: "",
            provider: "error",
            model: "error",
            durationMs: Date.now() - start,
            error: e.message,
          };
          onProgress?.({ task: sub, status: "error", result: res });
          return res;
        }
      });

      const batchResults = await this.opts.scheduler.runAll(tasks);
      allResults.push(...batchResults);
    }

    // optional: synthesis step — combine results via frontier if available
    return allResults;
  }

  /** High-level: decompose + execute + synthesize */
  async run(goal: string, opts?: { parallel?: number; model?: string }): Promise<{ subtasks: SubTask[]; results: OrchestratorResult[]; synthesis: string }> {
    const subtasks = await this.decompose(goal);
    logger.info(`Decomposed into ${subtasks.length} sub-tasks: ${subtasks.map((s) => s.title).join(" | ")}`);
    const results = await this.executeParallel(goal, subtasks);
    const synthesis = await this.synthesize(goal, results).catch(() => summarizeResults(results));
    return { subtasks, results, synthesis };
  }

  private async synthesize(goal: string, results: OrchestratorResult[]): Promise<string> {
    const provider = this.opts.registry.getFrontierProvider() ?? (await this.opts.registry.getLocalProvider());
    if (!provider) return summarizeResults(results);
    const model = await provider.listModels().then((m) => m[0]?.id).catch(() => null);
    if (!model) return summarizeResults(results);
    const agent = new Agent({ provider, model, workspaceRoot: this.opts.workspaceRoot, maxIterations: 1, systemPrompt: "You are a synthesis agent. Summarize sub-agent results concisely." });
    const prompt = `Original goal: ${goal}\n\nSub-agent results:\n${results.map((r) => `### ${r.taskId} (${r.provider}/${r.model}) ${r.error ? "FAILED: "+r.error : ""}\n${r.content.slice(0, 4000)}`).join("\n\n")}\n\nProduce a concise synthesis: what was done, what remains, key files changed.`;
    return agent.ask(prompt);
  }
}

function heuristicDecompose(goal: string): SubTask[] {
  const lower = goal.toLowerCase();
  if (lower.includes("test") && lower.includes("implement")) {
    return [
      { id: "t1", title: "Implement core", prompt: `Implement the core feature: ${goal}. Focus on source files.`, kind: "code" },
      { id: "t2", title: "Write tests", prompt: `Write tests for: ${goal}. Do not modify source except to understand API.`, kind: "test" },
    ];
  }
  if (lower.includes("refactor")) {
    return [
      { id: "t1", title: "Analyze codebase", prompt: `Analyze codebase for refactoring: ${goal}. Produce plan via glob/grep/read.`, kind: "search" },
      { id: "t2", title: "Apply refactor", prompt: `Apply refactoring: ${goal}. Make minimal precise edits.`, kind: "code" },
    ];
  }
  // generic: split by concern
  return [
    { id: "t1", title: "Explore & plan", prompt: `Explore workspace and plan for: ${goal}. Use glob/grep/read to understand structure.`, kind: "search" },
    { id: "t2", title: "Implement", prompt: `Implement: ${goal}. Make the required code changes.`, kind: "code" },
    { id: "t3", title: "Verify", prompt: `Verify implementation for: ${goal}. Run bash tests/builds and fix issues.`, kind: "test" },
  ];
}

function extractJsonArray(s: string): string | null {
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  return s.slice(start, end + 1);
}

function batchByDependencies(tasks: SubTask[]): SubTask[][] {
  // naive: if dependsOn present, level-sort, else single batch
  const hasDeps = tasks.some((t) => t.dependsOn?.length);
  if (!hasDeps) return [tasks];
  const map = new Map(tasks.map((t) => [t.id, t]));
  const visited = new Set<string>();
  const batches: SubTask[][] = [];
  const level = new Map<string, number>();
  function lvl(id: string): number {
    if (level.has(id)) return level.get(id)!;
    const t = map.get(id);
    if (!t || !t.dependsOn?.length) { level.set(id, 0); return 0; }
    const l = 1 + Math.max(...t.dependsOn.map(lvl));
    level.set(id, l);
    return l;
  }
  tasks.forEach((t) => lvl(t.id));
  const maxL = Math.max(...[...level.values()]);
  for (let i = 0; i <= maxL; i++) {
    batches.push(tasks.filter((t) => level.get(t.id) === i));
  }
  return batches.filter((b) => b.length);
}

function summarizeResults(results: OrchestratorResult[]): string {
  return results.map((r) => `**${r.taskId}** (${r.provider}/${r.model} ${r.durationMs}ms)${r.error ? " ❌ " + r.error : ""}:\n${r.content.slice(0, 800)}`).join("\n\n---\n\n");
}
