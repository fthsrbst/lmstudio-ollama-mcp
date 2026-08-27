import chalk from "chalk";
import { loadConfig, getGlobalConfigPath, findProjectConfig } from "../../config/store.js";
import { ProviderRegistry } from "../../providers/registry.js";
import { detectHardware, formatHardware } from "../../hardware/detector.js";

export async function handleDoctor() {
  console.log(chalk.bold("\n  ForgeCode — doctor\n"));

  const hw = detectHardware();
  console.log(chalk.bold("Hardware:"));
  console.log(chalk.dim(formatHardware(hw)) + "\n");

  const config = loadConfig();
  console.log(chalk.bold("Config:"));
  console.log(chalk.dim(`  global:  ${getGlobalConfigPath()}`));
  console.log(chalk.dim(`  project: ${findProjectConfig() ?? "(none — using global/default)"}`));
  console.log(chalk.dim(`  strategy: ${config.router.strategy}`));
  console.log(chalk.dim(`  providers: ${Object.keys(config.providers).join(", ") || "(none)"}\n`));

  const registry = new ProviderRegistry(config);
  console.log(chalk.bold("Providers:"));
  const statuses = await registry.listAvailable();
  if (!statuses.length) {
    console.log(chalk.yellow("  No providers configured."));
  }
  for (const { provider, available } of statuses) {
    const icon = available ? chalk.green("●") : chalk.red("○");
    const url = (provider as any).defaultBaseUrl ?? "";
    console.log(`  ${icon} ${chalk.bold(provider.id)} ${chalk.dim(`(${provider.displayName})`)}  ${chalk.dim(url)}  ${available ? chalk.green("available") : chalk.red("unavailable")}`);
    if (available) {
      try {
        const models = await provider.listModels();
        if (models.length) {
          console.log(chalk.dim(`     models: ${models.slice(0, 5).map((m) => m.id).join(", ")}${models.length > 5 ? ` +${models.length - 5} more` : ""}`));
        } else {
          console.log(chalk.dim("     models: (none detected)"));
        }
      } catch (e: any) {
        console.log(chalk.dim(`     models: error ${e.message}`));
      }
    }
  }

  console.log("");
  const localAvailable = statuses.some((s) => ["lmstudio", "ollama", "llamacpp"].includes(s.provider.id) && s.available);
  const frontierAvailable = statuses.some((s) => !["lmstudio", "ollama", "llamacpp"].includes(s.provider.id) && s.available);

  if (!localAvailable) {
    console.log(chalk.yellow("  ⚠ No local provider available."));
    console.log(chalk.dim("    → Start LM Studio: Developer → Local Server → Start Server (port 1234)"));
    console.log(chalk.dim("    → Or run Ollama: `ollama serve` then `ollama pull qwen2.5-coder:7b`"));
    console.log(chalk.dim("    → Or run llama.cpp: `./llama-server -m model.gguf --port 8080`"));
  } else {
    console.log(chalk.green("  ✔ Local provider ready"));
  }
  if (!frontierAvailable) {
    console.log(chalk.dim("  ℹ No frontier provider configured (optional). Set OPENAI_API_KEY or ANTHROPIC_API_KEY for hybrid mode."));
  } else {
    console.log(chalk.green("  ✔ Frontier provider ready (hybrid mode enabled)"));
  }

  console.log(chalk.bold("\n  Next steps:"));
  console.log(chalk.dim("    forge \"add a hello world test\"     # single task"));
  console.log(chalk.dim("    forge models                         # list models"));
  console.log(chalk.dim("    forge --provider lmstudio --model gemma-3-12b \"...\""));
  console.log("");
}
