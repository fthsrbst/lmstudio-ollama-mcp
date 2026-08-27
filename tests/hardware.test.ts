import { describe, it, expect } from "vitest";
import { detectHardware, recommendParallelism } from "../src/hardware/detector.js";
import { Scheduler } from "../src/hardware/scheduler.js";

describe("hardware detector", () => {
  it("detects hardware", () => {
    const hw = detectHardware();
    expect(hw.cpu.cores).toBeGreaterThanOrEqual(1);
    expect(hw.memory.totalGb).toBeGreaterThan(0);
    expect(hw.platform).toBeTruthy();
  });

  it("recommends parallelism within bounds", () => {
    const hw = detectHardware();
    const n = recommendParallelism(hw);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(16);
  });

  it("scheduler respects maxParallel", async () => {
    const hw = detectHardware();
    const s = new Scheduler({ hardware: hw, requestedParallelism: 2 });
    expect(s.maxParallel).toBe(2);
    let concurrent = 0;
    let maxConcurrent = 0;
    const tasks = Array.from({ length: 6 }, () => async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 30));
      concurrent--;
      return 1;
    });
    await s.runAll(tasks);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it("scheduler run() serializes beyond limit", async () => {
    const hw = detectHardware();
    const s = new Scheduler({ hardware: hw, requestedParallelism: 1 });
    const order: number[] = [];
    await Promise.all([
      s.run(async () => { await new Promise((r) => setTimeout(r, 20)); order.push(1); }),
      s.run(async () => { order.push(2); }),
      s.run(async () => { order.push(3); }),
    ]);
    expect(order).toEqual([1, 2, 3]);
  });
});
