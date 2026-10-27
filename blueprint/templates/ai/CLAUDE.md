# test

Read **`AGENTS.md`** first — it has the source layout, the authoring convention,
the verification commands and the traps. This file adds only what is specific to
Claude Code.

## Commands

```sh
bun run check                                  # every workspace
bun run --filter '@anti049/test' check   # plugin only: build, typecheck, test, publint
bun run dev                                    # docs site + plugin CSS watcher
bun changeset                                  # describe a release
```

## Tool notes

- **The Bash tool mangles heredocs containing backticks, `${}` or backslashes.**
  It has silently eaten template literals and dropped escapes, producing things
  like a function call with no argument. Use Write/Edit for any file containing
  them.
- Prefer `Read`/`Edit`/`Grep` over `cat`/`sed`/`rg` — the results integrate with
  the diff and permission UI.
- The dev server's watcher rebuilds `generated/` continuously. Running
  `bun run build` in parallel races it and produces a spurious "cannot find
  module `./generated/…`". Stop the dev server first.

## Subagents

Do not spawn one for work you can do inline. A subagent starts cold and
re-derives context this session already has. They earn their keep for genuinely
parallel, read-heavy exploration across many files — not for "this task has
several steps".

## Skills

`.claude/skills/` holds the repetitive multi-step tasks:

| Skill           | Use when                                                           |
| --------------- | ------------------------------------------------------------------ |
| `add-component` | adding a component across the plugin and all three bindings        |
| `verify-plugin` | confirming a change is safe for consumers (pack, install, compile) |
| `release-notes` | turning merged commits into a changeset                            |
