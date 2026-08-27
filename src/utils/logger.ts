import chalk from "chalk";

export type LogLevel = "debug" | "info" | "warn" | "error";

let currentLevel: LogLevel = (process.env.FORGE_LOG as LogLevel) || "info";
const order: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export function setLogLevel(l: LogLevel) {
  currentLevel = l;
}

function shouldLog(l: LogLevel) {
  return order[l] >= order[currentLevel];
}

export const logger = {
  debug: (...args: unknown[]) => {
    if (shouldLog("debug")) console.log(chalk.gray("[debug]"), ...args);
  },
  info: (...args: unknown[]) => {
    if (shouldLog("info")) console.log(chalk.cyan("[info]"), ...args);
  },
  warn: (...args: unknown[]) => {
    if (shouldLog("warn")) console.warn(chalk.yellow("[warn]"), ...args);
  },
  error: (...args: unknown[]) => {
    if (shouldLog("error")) console.error(chalk.red("[error]"), ...args);
  },
  success: (...args: unknown[]) => console.log(chalk.green("✔"), ...args),
  step: (msg: string) => console.log(chalk.dim("→"), msg),
};
