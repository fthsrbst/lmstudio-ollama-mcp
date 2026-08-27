import chalk from "chalk";
import { loadConfig } from "../../config/store.js";
import { ProviderRegistry } from "../../providers/registry.js";
import { bytesToHuman } from "../../utils/format.js";

export async function handleModels(opts: { json?: boolean }) {
  const config = loadConfig();
  const registry = new ProviderRegistry(config);
  const statuses = await registry.listAvailable();

  if (opts.json) {
    const all: any[] = [];
    for (const { provider, available } of statuses) {
      if (!available) continue;
      try {
        const models = await provider.listModels();
        all.push(...models);
      } catch {}
    }
    console.log(JSON.stringify(all, null, 2));
    return;
  }

  console.log(chalk.bold("\n  Available models\n"));
  let total = 0;
  for (const { provider, available } of statuses) {
    const header = available ? chalk.green(`● ${provider.id}`) + chalk.dim(` (${provider.displayName})`) : chalk.red(`○ ${provider.id}`) + chalk.dim(" (unavailable)");
    console.log(header);
    if (!available) {
      console.log(chalk.dim(`  └─ ${(provider as any).defaultBaseUrl}`));
      continue;
    }
    try {
      const models = await provider.listModels();
      total += models.length;
      if (!models.length) {
        console.log(chalk.dim("  └─ (no models found)"));
      } else {
        for (const m of models) {
          const size = m.sizeBytes ? chalk.dim(` ${bytesToHuman(m.sizeBytes)}`) : "";
          const quant = m.quantization ? chalk.yellow(` ${m.quantization}`) : "";
          console.log(`  ${chalk.cyan("▸")} ${chalk.bold(m.id)}${size}${quant} ${chalk.dim(`[${m.provider}]`)}`);
        }
      }
    } catch (e: any) {
      console.log(chalk.red(`  └─ error: ${e.message}`));
    }
    console.log("");
  }
  if (total === 0) {
    console.log(chalk.yellow("  No models detected. Start your local server and load a model:"));
    console.log(chalk.dim("    LM Studio: select a model → Load → Start Server"));
    console.log(chalk.dim("    Ollama: `ollama pull qwen2.5-coder:7b`"));
  } else {
    console.log(chalk.dim(`  Total: ${total} model(s)`));
  }
  console.log(chalk.dim("  Use: forge --model <provider:model> \"your task\""));
  console.log("");
}
