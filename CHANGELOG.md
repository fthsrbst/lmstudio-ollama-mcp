# Changelog

All notable changes to ForgeCode.

## 0.1.0 — 2026-08-27

- Initial release
- CLI: `forge`, `forge doctor`, `forge models`, `forge config`, `forge init`, interactive mode
- Providers: LM Studio (filesystem scan + `/v1/models`), Ollama (`/api/tags` + OpenAI compat), llama.cpp (`/health`), OpenAI / Anthropic (optional frontier)
- Router: `auto` / `local-first` / `local-only` / `frontier-first` with `preferLocalFor` + token thresholds
- Orchestrator: planner decomposes into 2–6 sub-tasks, Scheduler with hardware-aware `maxParallel` (cores × RAM, Apple Silicon bonus)
- Agent: 25-turn tool loop, 7 tools (read/write/edit/bash/glob/grep/list_dir), `reasoning_content` normalization
- Hardware: `detectHardware()` + `recommendParallelism()` + `Scheduler` (p-limit)
- Config: layered `DEFAULT < ~/.forgecode/config.json < ./forgecode.json` + env overrides, Zod schema
- Tools: workspace-sandboxed, path-escape guard, dangerous-command block, output truncation
- Tests: 24 passing (hardware, tools, router, config, providers)
- Docs: GitHub Pages landing (WizardZ-inspired) + professional README
