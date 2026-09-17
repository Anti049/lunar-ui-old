# 10. AI agent instructions

Three tools, three file formats, one set of facts. The failure mode is drift:
three files that used to agree, now quietly contradicting each other, with agents
confidently acting on whichever one they happened to read.

Nine steps. Steps 1–2 are decisions; 3–8 write the files; 9 stops them drifting.

Full files: [`../templates/ai/`](../templates/ai/).

---

## 1. Choose the shape: one canonical document, thin pointers

```text
AGENTS.md                       ← the source of truth. Everything lives here.
CLAUDE.md                       → "Read AGENTS.md" + Claude-specific bits
.github/copilot-instructions.md → "Read AGENTS.md" + Copilot-specific bits
.cursor/rules/*.mdc             → scoped rules that reference AGENTS.md
```

```powershell
New-Item -ItemType Directory -Force .claude/skills, .cursor/rules, .github/instructions
```

`AGENTS.md` is emerging as a cross-tool convention and Claude Code, Cursor and
several others already look for it. Keep the per-tool files under ~20 lines. If
you find yourself explaining the build in two places, you have already lost.

---

## 2. Decide what actually belongs in them

Not a description of the codebase — an agent can read the codebase. What it
cannot infer is:

1. **Which things are generated.** Nothing is more wasteful than an agent
   carefully editing `generated/` and reporting success.
2. **Which commands verify a change**, and that a green build is not verification.
3. **The traps.** Every silent-failure mode from these guides. An agent will hit
   `@reference` suppressing `@utility` exactly the way you did.
4. **Conventions that are not enforced by a tool** — derive-don't-hand-list, the
   layer scheme, where new components go.
5. **What is known-broken and should be left alone**, so nobody "fixes" it as a
   side effect and buries the real diff.

Write it in the imperative, addressed to whoever is about to change something.

A useful test before adding a line: _could a careful reader work this out from
the repository in under a minute?_ If yes, leave it out. Every sentence that
restates the obvious dilutes the five above.

---

## 3. Write `AGENTS.md`

**`AGENTS.md`** — new file, at the repository root. Structure:

```md
# Agent instructions

## Before you change anything

- `packages/core/src/` is the source of truth. The published artifact is a
  compiled plugin, not CSS. Editing `generated/` or `dist/` is never right.
- Read `docs/ARCHITECTURE.md` before touching the plugin build. It records
  Tailwind v4 behaviour established by experiment, several bits of which are
  counter-intuitive and expensive to rediscover.

## Verifying work

Run the package's own check, not just a build:
bun run --filter '@scope/project-name' check
`test/e2e.test.ts` compiles every component twice — once from raw CSS, once
through the compiled plugin — and compares selector by selector. A green run
means the plugin still faithfully represents the CSS.

For anything that changes what consumers receive, verify against a **packed
tarball** installed into a scratch app, not `bun link` — a link resolves to the
working tree and hides packaging bugs. Bump the version before repacking; the
package manager caches by name and version.

## Source layout

[the table from guide 2]

## Conventions

- **Derive lists from source.** Hand-maintained equivalents have shipped
  incomplete more than once.
- **Fail loudly on unknown input.** A typo that silently does nothing is the
  failure mode to avoid.
- **State findings, not conclusions.** Check against the real toolchain before
  acting on an assumption.

## Known-broken, leave alone

[whatever is currently true]
```

The last section is the one people skip writing and then regret. A repository
always has something broken-on-purpose; without a note, every new contributor
and every agent spends an hour rediscovering it.

Date the entries in that section. An undated "known-broken" note outlives the
breakage and then actively misleads.

---

## 4. Write `CLAUDE.md`

**`CLAUDE.md`** — new file, at the repository root beside `AGENTS.md`.

```md
# project-name

Read `AGENTS.md` first — it has the build rules, the verification commands and
the traps. This file adds only what is specific to Claude Code.

## Commands

    bun run check        # every workspace
    bun run dev          # docs site + plugin CSS watcher

## Tool notes

- The Bash tool mangles heredocs containing backticks, `${}` or backslashes. It
  has silently eaten template literals and dropped escapes. Use Write/Edit for
  any file containing them.
- Prefer `Read`/`Edit` over `sed`/`cat` — the results integrate with the diff UI.

## Subagents

Do not spawn one for work you can do inline. A subagent starts cold and
re-derives context this session already has.
```

That last section earns its place. Agents over-delegate, and saying explicitly
when _not_ to spawn one is more effective than saying when to.

---

## 5. Add Claude Code skills

Skills are directories under `.claude/skills/<name>/` with a `SKILL.md`. They are
worth writing for the repetitive, multi-step, easy-to-get-subtly-wrong tasks:

| Skill           | What it encapsulates                                                               |
| --------------- | ---------------------------------------------------------------------------------- |
| `add-component` | new CSS file, layer scheme, bindings in all three frameworks, docs page, changeset |
| `verify-plugin` | build, check, pack a tarball, install into a scratch app, confirm                  |
| `release-notes` | turn merged commits since the last tag into a changeset                            |

**`.claude/skills/add-component/SKILL.md`** — new file. The directory name
is the skill name; the file must be called `SKILL.md`.

```md
---
name: add-component
description: Add a component across the plugin and all three framework bindings, with docs and a changeset. Use when asked to add, create or scaffold a new component.
---

# Add a component

1. `packages/core/src/components/<name>.css` — foundation in
   `@layer <name>.l1.l2.l3`, variants in `.l1.l2`, state in `.l1`.
2. Add it to `src/components/_index.css`.
3. `bun run --filter '@scope/project-name' build` and confirm it appears in the
   bundle list.
4. Bindings in `packages/{svelte,react,vue}` — identical props and exports.
5. Docs page + class table generated from the registry.
6. `bun changeset` — minor, written as release notes.
7. `bun run check` must pass before you report done.
```

The `description` is what decides whether the skill gets used at all — it is
matched against the request. Write it as the trigger condition ("Use when asked
to…"), not as a summary of the contents.

---

## 6. Write the Copilot instructions

**`.github/copilot-instructions.md`** — new file. Copilot Chat picks it up
automatically, in VS Code and on github.com.

```md
# Copilot instructions

Read `AGENTS.md` for the build rules and verification commands.

Quick facts:

- Monorepo, Bun workspaces. Plugin in `packages/core`, bindings in
  `packages/{svelte,react,vue}`, site in `packages/docs`.
- `packages/core/generated/` and all `dist/` are build output. Never edit them.
- Components are authored as CSS in `packages/core/src/components/`, one file
  each, using `@layer <name>.l1[.l2[.l3]]` — deeper nesting is weaker.
- Commits follow Conventional Commits. Scopes: core, svelte, react, vue, docs,
  repo, deps.
- Every PR needs a changeset unless labelled `skip-changeset`.
```

---

## 7. Add path-scoped Copilot instructions

**`.github/instructions/plugin-css.md`** — new file. Any name works; the
`applyTo` glob in the frontmatter is what scopes it:

```md
---
applyTo: 'packages/core/src/**/*.css'
---

Author components as plain class selectors inside `@layer <name>.l1[.l2[.l3]]`.
Deeper nesting is weaker. Never hand-maintain a list of class names; the build
extracts them.
```

Two or three of these is the right number — one for the plugin's CSS, one for the
bindings, maybe one for the docs site. Past that they stop being read as rules
and start being read as noise.

---

## 8. Write the Cursor rules

Cursor uses `.cursor/rules/*.mdc` with frontmatter controlling when each applies.

**`.cursor/rules/plugin-css.mdc`** — new file. Note the `.mdc` extension.

```md
---
description: Plugin CSS authoring rules
globs: ['packages/core/src/**/*.css']
alwaysApply: false
---

- One component per file in `src/components/`.
- Layers nest: `@layer badge.l1.l2.l3` (foundation) → `.l1.l2` (variant) →
  `.l1` (state). Deeper is weaker, regardless of order.
- `src/base/` declares tokens and no classes; `src/utilities/` holds
  non-namespaced utilities. A utility in `base/` becomes invisible context.
- After any change: `bun run --filter '@scope/project-name' check`.
```

Use `alwaysApply: true` sparingly — **one** always-on rule pointing at
`AGENTS.md`, and everything else scoped by glob. Always-on rules consume context
on every request whether or not they are relevant.

---

## 9. Stop them drifting

**`.github/workflows/ci.yml`** — add a step to the `verify` job, after
`bun install`. It fails when the pointer files stop mentioning the canonical one:

```yaml
- name: Agent instructions agree
  run: |
    for f in CLAUDE.md .github/copilot-instructions.md; do
      grep -q 'AGENTS.md' "$f" || { echo "$f no longer points at AGENTS.md"; exit 1; }
    done
```

Better still: a review habit. Any PR that changes the build, the layer scheme or
the verification commands should touch `AGENTS.md` in the same commit. The CI
check catches deletion; only the habit catches contradiction.

---

## Files after this phase

| File                                    | Status   | Written in | Next touched by                 |
| --------------------------------------- | -------- | ---------- | ------------------------------- |
| `AGENTS.md`                             | added    | step 3     | any PR that changes the build   |
| `CLAUDE.md`                             | added    | step 4     | rarely                          |
| `.claude/skills/add-component/SKILL.md` | added    | step 5     | as the add-component flow grows |
| `.github/copilot-instructions.md`       | added    | step 6     | rarely                          |
| `.github/instructions/plugin-css.md`    | added    | step 7     | rarely                          |
| `.cursor/rules/plugin-css.mdc`          | added    | step 8     | rarely                          |
| `.github/workflows/ci.yml`              | modified | step 9     | never                           |

Full copies are in [`../templates/ai/`](../templates/ai/). The four instruction
files are given in full in steps 3–8 and are not repeated here.

---

### `.github/workflows/ci.yml` — the one added step

Goes in the `verify` job, after `bun install --frozen-lockfile`.

```yaml
- name: Agent instructions agree
  run: |
    for f in CLAUDE.md .github/copilot-instructions.md; do
      grep -q 'AGENTS.md' "$f" || { echo "$f no longer points at AGENTS.md"; exit 1; }
    done
```

This runs on `ubuntu-latest`, so it is bash regardless of what you author it on
([guide 0](00-prerequisites.md)).

It catches **deletion**, not contradiction — a pointer file that still mentions
`AGENTS.md` while disagreeing with it passes. Only the review habit catches
that: any PR that changes the build, the layer scheme or the verification
commands should touch `AGENTS.md` in the same commit.

---

## Traps

> **A fact duplicated into a pointer file.** The moment the build command appears
> in both `AGENTS.md` and `CLAUDE.md`, one of them starts aging. Nothing warns
> you, and an agent reading the stale one reports success against a command that
> no longer verifies anything.
>
> **Fix:** pointer files contain only what is genuinely tool-specific.

> **`alwaysApply: true` on several Cursor rules.** Every request carries all of
> them, so the rules that matter compete with the rules that do not. Quality
> degrades in a way that looks like the model getting worse.

> **An undated "known-broken" entry.** The breakage gets fixed, the note stays,
> and six months later somebody routes around a problem that no longer exists.

---

## Commit

```powershell
git add -A
git commit -m "docs(repo): add agent instructions"
```

Label the PR `skip-changeset`, or the workflow from
[guide 9](09-github.md) fails it — this ships nothing to a consumer.
---

Next: [Debugging](11-debugging.md)
