# lmstudio-ollama-mcp

<p align="center">
  <strong>Claude Code for Local Models</strong><br/>
  LM Studio · Ollama · llama.cpp bridge with hardware-aware parallel sub-agents.<br/>
  <em>Local-first. Private. Free. MCP-ready.</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/lmstudio-ollama-mcp"><img src="https://img.shields.io/npm/v/lmstudio-ollama-mcp?style=flat-square&label=npm&color=0A0A0A" alt="npm"/></a>
  <a href="https://github.com/fthsrbst/lmstudio-ollama-mcp/actions"><img src="https://img.shields.io/github/actions/workflow/status/fthsrbst/lmstudio-ollama-mcp/ci.yml?style=flat-square&label=CI" alt="CI"/></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-black?style=flat-square" alt="MIT"/></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-black?style=flat-square" alt="node"/>
  <img src="https://img.shields.io/badge/local--first-100%25-lime?style=flat-square&labelColor=0A0A0A&color=BFFF00" alt="local-first"/>
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> •
  <a href="#why-lmstudio-ollama-mcp">Why</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#providers">Providers</a> •
  <a href="#parallel-sub-agents">Parallel Sub-Agents</a> •
  <a href="#configuration">Configuration</a> •
  <a href="https://fthsrbst.github.io/lmstudio-ollama-mcp">Landing Page</a>
</p>

```
npm install -g lmstudio-ollama-mcp
lmstudio-ollama-mcp doctor   # or: forge doctor
lmstudio-ollama-mcp "add unit tests for src/utils/logger.ts"
```

> **Local-first. Private. Free. No API keys required.** Frontier models (GPT-4o, Claude 4) are optional — used only as planners while small local models do the work. Alias `forge` / `forgecode` keeps muscle memory.

---

## Why lmstudio-ollama-mcp

| | Claude Code / Codex | **lmstudio-ollama-mcp** |
|---|---|---|
| **Runs on** | Cloud API (paid, data leaves machine) | **LM Studio · Ollama · llama.cpp** (offline, private) |
| **Cost** | $ per token | **$0** after model download |
| **Sub-agents** | Single-threaded or cloud parallelism | **Hardware-aware local parallelism** |
| **Model choice** | Vendor-locked | **Any GGUF / OpenAI-compatible model** |
| **Hybrid mode** | — | **Frontier plans, local executes** (optional) |
| **Sandbox** | Cloud container | **Your filesystem, your rules** |
| **MCP** | — | **Ready: bridges local runtimes as MCP tools** |

**Single sentence:** lmstudio-ollama-mcp brings the *Claude Code* agentic loop — read → plan → edit → verify with tools — to your MacBook, with an intelligent router that sends trivial tasks to a local 7B and hard reasoning to a frontier model only when needed.

---

## Demo

```bash
# 1 — Diagnose
lmstudio-ollama-mcp doctor
# Hardware: Apple M3 (8 cores / 16GB) • Recommended: 8 agents
# ● lmstudio (LM Studio) http://localhost:1234/v1  available
#   models: gemma-3-12b-qat, qwen3-27b-ud-iq2_s …

lmstudio-ollama-mcp models
# ● lmstudio  ▸ gemma-3-12b-qat 6.5GB Q4_0
#             ▸ qwen3-27b 7.8GB IQ2_S

# 2 — One-shot
lmstudio-ollama-mcp "refactor src/providers into a registry + add tests. keep public API stable"

# 3 — Parallel (auto-splits into sub-agents)
lmstudio-ollama-mcp --parallel 4 "implement auth module, write tests, and update docs"
# forge alias also works:
forge --parallel 4 "implement auth module, write tests, and update docs"

# 4 — Force a specific model
lmstudio-ollama-mcp --model ollama:qwen2.5-coder:14b "explain this repo's error handling"
lmstudio-ollama-mcp --provider lmstudio --model gemma-3-12b "fix the failing test in tests/tools.test.ts"

# 5 — Interactive
lmstudio-ollama-mcp
# lmstudio-ollama-mcp> add dark mode to docs/index.html
```

---

## Quickstart

### Prerequisites

- **Node.js >= 18**
- One of:
  - **[LM Studio](https://lmstudio.ai)** — Developer → Local Server → Start (port `1234`)
  - **[Ollama](https://ollama.com)** — `ollama serve` then `ollama pull qwen2.5-coder:7b`
  - **[llama.cpp](https://github.com/ggerganov/llama.cpp)** — `./llama-server -m model.gguf --port 8080`

### Install

```bash
npm install -g lmstudio-ollama-mcp
# aliases also available: forge, forgecode
# or one-off
npx lmstudio-ollama-mcp doctor
```

### First run

```bash
git clone https://github.com/your-org/your-project && cd your-project
lmstudio-ollama-mcp init   # creates lmstudio-ollama-mcp.json (also reads forgecode.json for compat)
lmstudio-ollama-mcp doctor # verify providers + hardware
lmstudio-ollama-mcp "list the codebase structure and suggest 3 small improvements"
```

No API keys needed for local-only mode. For hybrid mode (frontier + local), set env:

```bash
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  CLI  lmstudio-ollama-mcp "task"  •  doctor  •  models   │
│       aliases: forge, forgecode                         │
├─────────────────────────────────────────────────────────┤
│  Router  (strategy: auto | local-first | frontier-first)│
│  ├─ classify(prompt) → trivial | small | medium | large │
│  └─ thresholds.preferLocalFor: lint/format/test/search  │
├─────────────────────────────────────────────────────────┤
│  Orchestrator  (decompose → batch by deps → schedule)   │
│  ├─ Planner LLM decomposes goal → SubTasks[]            │
│  └─ Scheduler (hardware-aware p-limit, preserves order) │
├─────────────────────────────────────────────────────────┤
│  Agent Loop  (provider.chat ↔ tool executor)            │
│  ├─ Tools: read_file, write_file, edit_file, bash,      │
│  │        glob, grep, list_dir                           │
│  └─ Max 25 tool turns, exact-string edits               │
├─────────────────────────────────────────────────────────┤
│  Providers  (OpenAI-compatible)                         │
│  ├─ LM Studio  http://localhost:1234/v1  (+ fs scan)    │
│  ├─ Ollama     http://localhost:11434 (+ /api/tags)     │
│  ├─ llama.cpp  http://localhost:8080/v1                 │
│  └─ Frontier   OpenAI / Anthropic (optional)            │
├─────────────────────────────────────────────────────────┤
│  Hardware Detector  •  Scheduler                        │
│  cores × overcommit, free mem / perAgent → maxParallel │
│  Apple Silicon bonus, clamp 1..16                       │
└─────────────────────────────────────────────────────────┘
```

**Data flow:**

```
User prompt
  → Router.classify → pick provider+model (local for small, frontier for large)
  → If parallel & non-trivial: Orchestrator.decompose → 2-6 SubTasks
  → Scheduler.runAll(SubTasks) with maxParallel = f(cores, RAM)
  → Each SubTask → Agent(provider, model, ToolExecutor) → tool loop
  → Synthesis agent merges results
  → Final summary
```

---

## Providers

| Provider | Default URL | Discovery | Notes |
|---|---|---|---|
| **LM Studio** | `http://localhost:1234/v1` | `/v1/models` + `~/.lmstudio/models/**/*.gguf` scan | Supports `reasoning_content` (Gemma) |
| **Ollama** | `http://localhost:11434` | `/api/tags` native, fallback `/v1/models` | `ollama pull <model>` required |
| **llama.cpp** | `http://localhost:8080` | `/health` + `/v1/models` | Any GGUF via `llama-server` |
| OpenAI | `https://api.openai.com/v1` | API | Set `OPENAI_API_KEY` |
| Anthropic | `https://api.anthropic.com` | API | Set `ANTHROPIC_API_KEY` |

All providers speak **OpenAI-compatible Chat Completions** with `tools` (function calling). Normalizes `reasoning_content` (Qwen/Gemma) automatically.

### Adding a custom endpoint

```json
// lmstudio-ollama-mcp.json
{
  "providers": {
    "my-local": { "type": "openai", "baseUrl": "http://192.168.1.10:1234/v1", "enabled": true }
  }
}
```

---

## Parallel Sub-Agents

Splits complex goals into **2–6 independent sub-tasks** via a planner LLM (frontier if available, otherwise local). Execution is bounded by hardware:

```ts
// hardware/detector.ts — recommendParallelism()
cpuLimit = floor(cores * overcommit) - 1
memLimit = floor((totalGb*1024 - 2048) / perAgentMb)
maxParallel = min(cpuLimit, memLimit) + appleSiliconBonus
// clamp: 1..8 default, up to 16 on 64GB machines
```

```bash
lmstudio-ollama-mcp --parallel 8 "migrate codebase from Jest to Vitest"
# Decomposed:
#  t1 Explore & plan  →  search (routed to local 7B)
#  t2 Implement       →  code   (routed to local or frontier)
#  t3 Verify          →  test   (routed to local)
# Runner: Scheduler.runAll with p-limit = 8
```

Tasks with `dependsOn` are batched topologically — batch N only starts after N-1 completes.

**Local-model friendly:** trivial tasks (`lint`, `format`, `summarize`, `explain`) are *always* routed locally regardless of strategy.

---

## Configuration

Config resolution: **`DEFAULT` < `~/.lmstudio-ollama-mcp/config.json` < `./lmstudio-ollama-mcp.json`** < env vars.  
Legacy `~/.forgecode/config.json` and `forgecode.json` / `forge.json` are still read for backward compat (new path takes precedence).

```bash
lmstudio-ollama-mcp config --show   # resolved JSON
lmstudio-ollama-mcp config --path   # file locations
lmstudio-ollama-mcp init            # scaffold lmstudio-ollama-mcp.json
```

### `lmstudio-ollama-mcp.json` reference

```jsonc
{
  "version": 1,
  "providers": {
    "lmstudio": { "type": "lmstudio", "baseUrl": "http://localhost:1234/v1", "enabled": true },
    "ollama":   { "type": "ollama",   "baseUrl": "http://localhost:11434",      "enabled": true },
    "llamacpp": { "type": "llamacpp", "baseUrl": "http://localhost:8080",       "enabled": true },
    "openai":   { "type": "openai",   "baseUrl": "https://api.openai.com/v1",   "apiKey": "sk-..." }
  },
  "router": {
    "strategy": "auto", // auto | local-first | frontier-first | local-only
    "frontierProvider": "openai",
    "frontierModel": "gpt-4o-mini",
    "thresholds": {
      "smallTaskMaxTokens": 2000,
      "preferLocalFor": ["lint","format","test","search","summarize","explain"]
    }
  },
  "hardware": {
    "maxParallelAgents": 4,      // auto if omitted
    "maxMemoryPerAgentMb": 1200,
    "cpuOvercommit": 1
  },
  "permissions": {
    "allowBash": true,
    "allowWriteOutsideWorkspace": false,
    "allowNetwork": true
  }
}
```

**Strategies:**

- `auto` — trivial/small → local, medium/large → frontier if available else local. *(recommended)*
- `local-first` — only medium/large go to frontier.
- `local-only` — never call frontier (air-gapped).
- `frontier-first` — always prefer frontier.

---

## Tools

Agents have 7 tools — the same surface as Claude Code, sandboxed to the workspace:

| Tool | Description |
|---|---|
| `read_file` | Read a file (2 MB limit, else use grep) |
| `write_file` | Create/overwrite a file (mkdir -p auto) |
| `edit_file` | Exact-string replacement (must match once) |
| `bash` | Run a command (`timeout 30s`, 5 MB buffer) |
| `glob` | `fast-glob` search |
| `grep` | Regex search (skips `node_modules/dist/.git`) |
| `list_dir` | Directory listing |

Safety: path escape blocked unless `permissions.allowWriteOutsideWorkspace=true`; dangerous commands (`rm -rf /`) rejected; large outputs truncated (30k).

---

## Comparison: When to use which model

| Task | Why local wins | Example |
|---|---|---|
| **Lint / format / grep** | 0.2s vs 2s RTT | `lmstudio-ollama-mcp "format src/**/*.ts with prettier"` |
| **Explain / summarize** | Private codebase stays local | `lmstudio-ollama-mcp "explain how auth works"` |
| **Small edits** | No queue, no cost | `lmstudio-ollama-mcp "add zod validation to src/config/schema.ts"` |
| **Large refactor** | Frontier plans, locals execute in parallel | `lmstudio-ollama-mcp "migrate to ESM"` |
| **Hard reasoning** | 70B / frontier needed | `lmstudio-ollama-mcp --model openai:gpt-4o "design CRDT sync"` |

---

## Development

```bash
npm install
npm run build        # tsc
npm test             # vitest
npm run dev -- doctor
```

**Project map:**

```
src/
  cli/            commander CLI + commands (doctor, models, config, init)
  config/         Zod schema + layered store (global ↔ project)
  hardware/       detector (cores/RAM/GPU) + p-limit scheduler
  providers/      base + openai-compatible + lmstudio/ollama/llamacpp + registry + router
  core/           Agent (tool loop) + Orchestrator (decompose + parallel)
  tools/          definitions + executor (fs/glob/grep/bash)
  utils/          logger, format
tests/            vitest suites (hardware, tools, router, config, providers)
docs/             GitHub Pages landing (WizardZ-inspired, lime/black)
```

---

## Roadmap

- [ ] Streaming output (`--stream`)
- [ ] MCP (Model Context Protocol) server — expose local models as MCP tools for other agents
- [ ] Persistent memory (`.lmstudio-ollama-mcp/memory.md`)
- [ ] `lmstudio-ollama-mcp plan` — dry-run decomposition without execution
- [ ] Vision models (Gemma 12B multimodal) for screenshot-driven UI work
- [ ] `hooks` — pre/post tool hooks
- [ ] Windows / Linux GPU (CUDA/Vulkan) scheduler hints

---

## Contributing

PRs welcome. Keep the core principles: **local-first, minimal deps, hardware-aware, no AI slop**.

```bash
npm run build && npm test
```

---

## Keywords

`lm-studio` `lmstudio` `ollama` `llama.cpp` `local-llm` `local-first` `coding-agent` `autonomous-agent` `claude-code` `codex` `sub-agents` `parallel-agents` `mcp` `model-context-protocol` `hardware-aware` `openai-compatible` `gguf` `agentic` `dev-tools` `ai-coding` `on-device-ai` `privacy`

---

## License

MIT — see [LICENSE](./LICENSE).

<p align="center"><sub>Built for developers who want <b>Claude Code</b> without the cloud — now as an <b>LM Studio · Ollama bridge</b>.</sub></p>
