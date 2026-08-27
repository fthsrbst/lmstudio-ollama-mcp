import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_CONFIG } from "../../config/schema.js";

export async function handleInit() {
  const target = path.join(process.cwd(), "lmstudio-ollama-mcp.json");
  if (fs.existsSync(target)) {
    console.log(chalk.yellow(`  lmstudio-ollama-mcp.json already exists at ${target}`));
    return;
  }
  const sample = {
    version: 1,
    providers: DEFAULT_CONFIG.providers,
    router: DEFAULT_CONFIG.router,
    hardware: DEFAULT_CONFIG.hardware,
    permissions: DEFAULT_CONFIG.permissions,
  };
  fs.writeFileSync(target, JSON.stringify(sample, null, 2));
  console.log(chalk.green(`  ✔ Created ${target}`));
  console.log(chalk.dim("  Edit providers/router as needed. Run `lmstudio-ollama-mcp doctor` (or `forge doctor`) to verify."));
}
