import os from "node:os";
import { execSync } from "node:child_process";

export interface HardwareInfo {
  cpu: {
    cores: number;
    physicalCores: number;
    model: string;
    arch: string;
  };
  memory: {
    totalGb: number;
    freeGb: number;
    totalBytes: number;
  };
  gpu?: {
    name: string;
    vramGb?: number;
  }[];
  platform: string;
  isAppleSilicon: boolean;
}

export function detectHardware(): HardwareInfo {
  const cpus = os.cpus();
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const isAppleSilicon = process.platform === "darwin" && process.arch === "arm64";

  let gpu: HardwareInfo["gpu"];
  try {
    if (process.platform === "darwin") {
      const out = execSync("system_profiler SPDisplaysDataType 2>/dev/null", { encoding: "utf-8" });
      const names = [...out.matchAll(/Chipset Model:\s*(.+)/g)].map((m) => m[1].trim());
      if (names.length) gpu = names.map((n) => ({ name: n }));
    } else if (process.platform === "linux") {
      try {
        const out = execSync("lspci 2>/dev/null | grep -i vga", { encoding: "utf-8" });
        if (out) gpu = out.split("\n").filter(Boolean).map((l) => ({ name: l.trim() }));
      } catch {}
    }
  } catch {}

  // estimate physical cores (approx logical / 2 on x86, 1:1 on Apple perf+eff mix but keep logical)
  const logical = cpus.length || os.availableParallelism?.() || 4;
  const physical = isAppleSilicon ? logical : Math.max(1, Math.round(logical / 2));

  return {
    cpu: {
      cores: logical,
      physicalCores: physical,
      model: cpus[0]?.model ?? "unknown",
      arch: process.arch,
    },
    memory: {
      totalGb: Math.round((totalBytes / 1024 ** 3) * 10) / 10,
      freeGb: Math.round((freeBytes / 1024 ** 3) * 10) / 10,
      totalBytes,
    },
    gpu,
    platform: `${process.platform}-${process.arch}`,
    isAppleSilicon,
  };
}

export function recommendParallelism(hw: HardwareInfo, opts?: { maxMemoryPerAgentMb?: number; cpuOvercommit?: number }): number {
  const overcommit = opts?.cpuOvercommit ?? 1;
  // CPU bound: cores * overcommit, but leave 1 core free
  const cpuLimit = Math.max(1, Math.floor(hw.cpu.cores * overcommit) - 1);

  // Memory bound: reserve 2GB for OS, divide remaining by per-agent budget
  // Heuristic: per-agent 1.5GB for GGUF 7B Q4, 0.8GB for small tasks; default 1.2GB
  const perAgentMb = opts?.maxMemoryPerAgentMb ?? 1200;
  const usableMb = hw.memory.totalGb * 1024 - 2048;
  const memLimit = Math.max(1, Math.floor(usableMb / perAgentMb));

  // Apple Silicon unified memory: slightly more efficient
  const unifiedBonus = hw.isAppleSilicon ? 1 : 0;

  const suggested = Math.min(cpuLimit, memLimit) + unifiedBonus;
  // clamp 1..8 for default, higher if machine is beefy
  if (hw.memory.totalGb >= 32 && hw.cpu.cores >= 12) return Math.min(suggested, 12);
  if (hw.memory.totalGb >= 64) return Math.min(suggested, 16);
  return Math.min(Math.max(suggested, 1), 8);
}

export function formatHardware(hw: HardwareInfo): string {
  const lines = [
    `CPU: ${hw.cpu.model} (${hw.cpu.cores} logical / ${hw.cpu.physicalCores} physical, ${hw.cpu.arch})`,
    `Memory: ${hw.memory.totalGb} GB total, ${hw.memory.freeGb} GB free`,
    `Platform: ${hw.platform}${hw.isAppleSilicon ? " (Apple Silicon)" : ""}`,
  ];
  if (hw.gpu?.length) lines.push(`GPU: ${hw.gpu.map((g) => g.name).join(", ")}`);
  lines.push(`Recommended parallelism: ${recommendParallelism(hw)} agents`);
  return lines.join("\n");
}
