import chalk from "chalk";
import fs from "node:fs";
import { loadConfig, getGlobalConfigPath, findProjectConfig } from "../../config/store.js";

export async function handleConfig(opts: { show?: boolean; path?: boolean }) {
  if (opts.path) {
    console.log(getGlobalConfigPath());
    const proj = findProjectConfig();
    if (proj) console.log(proj);
    return;
  }
  const config = loadConfig();
  console.log(chalk.bold("\n  Resolved config\n"));
  console.log(chalk.dim(`  global:  ${getGlobalConfigPath()}`));
  console.log(chalk.dim(`  project: ${findProjectConfig() ?? "(none)"}\n`));
  console.log(JSON.stringify(config, null, 2));
  console.log(chalk.dim("\n  Edit: ~/.lmstudio-ollama-mcp/config.json  or  ./lmstudio-ollama-mcp.json"));
  console.log(chalk.dim("  (legacy) ~/.forgecode/config.json / forgecode.json still supported"));
  console.log(chalk.dim("  Docs: https://fthsrbst.github.io/lmstudio-ollama-mcp#config\n"));
}
