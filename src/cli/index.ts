#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { loadConfig } from "../config/store.js";
import { ProviderRegistry } from "../providers/registry.js";
import { ModelRouter } from "../providers/router.js";
import { detectHardware, formatHardware, recommendParallelism } from "../hardware/detector.js";
import { Scheduler } from "../hardware/scheduler.js";
import { Agent } from "../core/agent.js";
import { Orchestrator } from "../core/orchestrator.js";
import { ToolExecutor } from "../tools/executor.js";
import { setLogLevel } from "../utils/logger.js";
import { handleDoctor } from "./commands/doctor.js";
import { handleModels } from "./commands/models.js";
import { handleConfig } from "./commands/config.js";
import { handleInit } from "./commands/init.js";

const pkg = { version: "0.1.0", name: "lmstudio-ollama-mcp" };

const program = new Command();
program
  .name("lmstudio-ollama-mcp")
  .alias("forge")
  .description("Claude Code for local models — LM Studio · Ollama · llama.cpp bridge with hardware-aware parallel sub-agents")
  .version(pkg.version, "-v, --version")
  .option("--verbose", "verbose logging")
  .option("--model <id>", "override model (e.g. lmstudio:gemma-3-12b or ollama:qwen2.5-coder:7b)")
  .option("--parallel <n>", "max parallel sub-agents", (v) => parseInt(v, 10))
  .option("--no-parallel", "disable parallel sub-agents")
  .option("--provider <id>", "force provider (lmstudio|ollama|llamacpp|openai)")
  .hook("preAction", (thisCmd) => {
    if (thisCmd.opts().verbose) setLogLevel("debug");
  });

// default action: run agent on prompt
program
  .argument("[prompt...]", "task to execute (interactive if empty)")
  .action(async (promptParts: string[], opts, cmd) => {
    // if subcommand was used, this won't fire for those; but commander still triggers for no-arg? handled
    const globalOpts = cmd.parent ? cmd.parent.opts() : cmd.opts();
    // detect if a subcommand is being invoked — commander handles, but we guard
    const prompt = promptParts.join(" ").trim();
    if (!prompt) {
      // check if any subcommand matched; if so, don't run interactive
      // commander will have exited if subcommand; so this is interactive mode
      await runInteractive(globalOpts);
      return;
    }
    await runTask(prompt, globalOpts);
  });

program
  .command("doctor")
  .description("Diagnose local providers, hardware and config")
  .action(async () => {
    await handleDoctor();
  });

program
  .command("models")
  .description("List available local & remote models")
  .option("--json", "JSON output")
  .action(async (opts) => {
    await handleModels(opts);
  });

program
  .command("config")
  .description("Show or edit config")
  .option("--show", "show resolved config")
  .option("--path", "show config file paths")
  .action(async (opts) => {
    await handleConfig(opts);
  });

program
  .command("init")
  .description("Initialize lmstudio-ollama-mcp.json in current project")
  .action(async () => {
    await handleInit();
  });

program
  .command("run <prompt...>")
  .description("Run a task (alias for forge \"...\")")
  .option("--parallel <n>", "max parallel sub-agents", (v) => parseInt(v, 10))
  .action(async (parts: string[], opts, cmd) => {
    const parentOpts = cmd.parent?.opts() ?? {};
    await runTask(parts.join(" "), { ...parentOpts, ...opts });
  });

async function runInteractive(globalOpts: any) {
  const { default: inquirer } = await import("inquirer");
  console.log(chalk.bold("\n  lmstudio-ollama-mcp ") + chalk.dim(`v${pkg.version}`) + chalk.green("  ● local-first\n"));
  console.log(chalk.dim("  Tip: type a task, 'doctor', 'models', or 'exit'\n"));
  while (true) {
    const { input } = await inquirer.prompt([{ type: "input", name: "input", message: chalk.cyan("lmstudio-ollama-mcp>") }]);
    const trimmed = (input as string).trim();
    if (!trimmed) continue;
    if (["exit", "quit", "q"].includes(trimmed.toLowerCase())) break;
    if (trimmed === "doctor") { await handleDoctor(); continue; }
    if (trimmed === "models") { await handleModels({}); continue; }
    await runTask(trimmed, globalOpts);
  }
  console.log(chalk.dim("\nBye!"));
}

async function runTask(prompt: string, globalOpts: any) {
  const config = loadConfig();
  const registry = new ProviderRegistry(config);
  const router = new ModelRouter(registry, config);
  const hw = detectHardware();
  const scheduler = new Scheduler({ hardware: hw, config, requestedParallelism: globalOpts.parallel ?? (globalOpts.parallel === false ? 1 : undefined) });

  // resolve provider/model override
  let forcedProvider: string | undefined = globalOpts.provider;
  let forcedModel: string | undefined = globalOpts.model;
  if (forcedModel?.includes(":")) {
    const [prov, ...rest] = forcedModel.split(":");
    if (["lmstudio", "ollama", "llamacpp", "openai", "anthropic"].includes(prov)) {
      forcedProvider = prov;
      forcedModel = rest.join(":");
    }
  }

  console.log(chalk.bold("\n▶ lmstudio-ollama-mcp") + chalk.dim(`  • ${prompt.slice(0, 80)}${prompt.length > 80 ? "…" : ""}`));
  console.log(chalk.dim(`  hw: ${hw.cpu.cores} cores / ${hw.memory.totalGb}GB  • parallel: ${scheduler.maxParallel}  • strategy: ${config.router.strategy}`));

  // If single-agent mode or trivial task, run direct agent
  const complexity = router.classifyTask(prompt);
  const useParallel = globalOpts.parallel !== false && complexity !== "trivial" && prompt.length > 80;

  if (!useParallel) {
    // direct single agent
    let decision;
    try {
      decision = await router.route(prompt, { preferredModel: forcedModel, kind: "code" });
      if (forcedProvider) {
        const p = registry.get(forcedProvider);
        if (p) decision = { ...decision, provider: p, model: forcedModel ?? decision.model } as any;
      }
    } catch (e: any) {
      console.error(chalk.red(`\nNo provider available: ${e.message}`));
      console.log(chalk.dim("Run `forge doctor` to diagnose. Start LM Studio server (Developer → Local Server → Start) or `ollama serve`."));
      process.exit(1);
    }

    console.log(chalk.dim(`  → ${decision.provider.id}/${decision.model}  (${decision.reason})  [${decision.complexity}]\n`));

    const agent = new Agent({
      provider: decision.provider,
      model: decision.model,
      workspaceRoot: process.cwd(),
      executor: new ToolExecutor(process.cwd(), {
        allowBash: config.permissions.allowBash,
        allowWriteOutsideWorkspace: config.permissions.allowWriteOutsideWorkspace,
      }),
    });

    const start = Date.now();
    try {
      const result = await agent.run(prompt, (ev) => {
        if (ev.type === "tool_call") console.log(chalk.yellow(`  ↳ ${ev.data.name}`) + chalk.dim(` ${JSON.stringify(ev.data.arguments).slice(0, 120)}`));
        else if (ev.type === "tool_result" && ev.data.isError) console.log(chalk.red(`    ✗ ${ev.data.content.slice(0, 300)}`));
        else if (ev.type === "text") { /* will print at end */ }
      });
      console.log(chalk.dim(`\n  ── ${((Date.now() - start) / 1000).toFixed(1)}s ──\n`));
      console.log(result || chalk.dim("(no output)"));
    } catch (e: any) {
      console.error(chalk.red(`\nAgent failed: ${e.message}`));
      if (e.cause) console.error(chalk.dim(String(e.cause)));
    }
    return;
  }

  // parallel orchestrator path
  const orchestrator = new Orchestrator({ workspaceRoot: process.cwd(), config, registry, router, scheduler });
  console.log(chalk.dim(`  → orchestrator: decomposing into sub-agents...\n`));
  const start = Date.now();
  try {
    const { subtasks, results, synthesis } = await orchestrator.run(prompt, { parallel: scheduler.maxParallel, model: forcedModel });
    console.log(chalk.bold(`\n  Sub-tasks (${subtasks.length}):`));
    subtasks.forEach((t) => console.log(`   • ${chalk.cyan(t.id)} ${t.title}  ${chalk.dim(`[${t.kind ?? "general"}]`)}`));
    console.log("");
    for (const r of results) {
      const icon = r.error ? chalk.red("✗") : chalk.green("✔");
      console.log(`${icon} ${chalk.bold(r.taskId)} ${chalk.dim(`${r.provider}/${r.model} ${(r.durationMs / 1000).toFixed(1)}s`)}`);
      if (r.error) console.log(chalk.red(`   ${r.error.slice(0, 400)}`));
      else console.log(chalk.dim(`   ${r.content.slice(0, 600).replace(/\n/g, " ").slice(0, 600)}${r.content.length > 600 ? "…" : ""}`));
    }
    console.log(chalk.bold("\n  Synthesis:\n") + chalk.white(synthesis.slice(0, 4000)));
    console.log(chalk.dim(`\n  ── total ${(Date.now() - start) / 1000}s ──`));
  } catch (e: any) {
    console.error(chalk.red(`\nOrchestrator failed: ${e.message}`));
  }
}

program.parseAsync(process.argv);
