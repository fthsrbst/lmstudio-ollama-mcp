# Examples

## 1 — Local-only refactor (M3, 16GB)
```bash
forge --strategy local-only "refactor src/tools/executor.ts to extract grep into a separate module"
```

## 2 — Hybrid (frontier plans, local executes)
```bash
export OPENAI_API_KEY=sk-...
forge --strategy auto "design and implement a rate-limiter middleware for src/server"
# router: planning → gpt-4o-mini, execution → lmstudio/gemma-3-12b
```

## 3 — Parallel migration
```bash
forge --parallel 6 "migrate test suite from Jest to Vitest, update all configs"
# → t1 explore, t2 implement, t3 verify (parallel where independent)
```

## 4 — Ask local model
```bash
forge --model ollama:qwen2.5-coder:7b "explain how the Scheduler caps parallelism"
```
