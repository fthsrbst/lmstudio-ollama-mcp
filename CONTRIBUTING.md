# Contributing to ForgeCode

Thanks for contributing — ForgeCode is local-first, so we keep the bar high on code quality and low on ceremony.

## Quick start

```bash
npm install
npm run build
npm test
```

## Principles

- **Local-first** — never assume cloud. Test with LM Studio / Ollama offline.
- **Hardware-aware** — respect `Scheduler.maxParallel`, don't spawn unbounded agents.
- **Minimal deps** — prefer Node stdlib; justify new deps.
- **No AI slop** — precise edits, exact-string `edit_file`, verification via `bash` tests.

## Pull requests

1. Branch from `main`: `feat/my-feature` or `fix/bug-name`
2. Keep diffs narrow. One concern per PR.
3. Add/adjust tests in `tests/` (`vitest`).
4. Run `npm run build && npm test` before pushing.
5. Update `README.md` if you change CLI or config.

## Commit style

Conventional Commits:

```
feat(provider): add llama.cpp health check
fix(router): handle reasoning_content fallback
docs: update architecture diagram
```

## Reporting bugs

Include:

- `forge doctor` output
- `forge models` output
- OS, Node version, provider (LM Studio / Ollama / llama.cpp)
- Minimal repro prompt

## License

By contributing you agree your work is MIT-licensed.
