import { detectHardware, recommendParallelism, type HardwareInfo } from "./detector.js";
import type { ForgeConfig } from "../config/schema.js";

export interface SchedulerOptions {
  hardware?: HardwareInfo;
  config?: ForgeConfig;
  requestedParallelism?: number;
}

export class Scheduler {
  readonly hardware: HardwareInfo;
  readonly maxParallel: number;
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(opts: SchedulerOptions = {}) {
    this.hardware = opts.hardware ?? detectHardware();
    const auto = recommendParallelism(this.hardware, {
      maxMemoryPerAgentMb: opts.config?.hardware.maxMemoryPerAgentMb,
      cpuOvercommit: opts.config?.hardware.cpuOvercommit,
    });
    const configured = opts.config?.hardware.maxParallelAgents;
    const requested = opts.requestedParallelism;
    this.maxParallel = Math.min(requested ?? configured ?? auto, 32);
  }

  get availableSlots() {
    return this.maxParallel - this.active;
  }
  get utilization() {
    return this.maxParallel ? this.active / this.maxParallel : 0;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxParallel) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
      const next = this.queue.shift();
      if (next) next();
    }
  }

  /** run many tasks with bounded parallelism, preserving order */
  async runAll<T>(tasks: Array<() => Promise<T>>): Promise<T[]> {
    const results: T[] = new Array(tasks.length);
    let idx = 0;
    const workers = Array.from({ length: Math.min(this.maxParallel, tasks.length) }, async () => {
      while (true) {
        const cur = idx++;
        if (cur >= tasks.length) break;
        results[cur] = await this.run(tasks[cur]!);
      }
    });
    await Promise.all(workers);
    return results;
  }

  describe(): string {
    return `Scheduler: ${this.active}/${this.maxParallel} active, hw=${this.hardware.cpu.cores} cores / ${this.hardware.memory.totalGb}GB`;
  }
}
