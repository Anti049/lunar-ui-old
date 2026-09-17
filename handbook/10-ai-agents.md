# 10 — AI Agent Scaffolding

Three AI coding assistants are supported, each with its own config format, plus a
set of shared "skills" that encode repo-specific procedures. The goal: any agent
that opens this repo understands its architecture, conventions, and the
cross-framework parity rule — so it does not, for example, add a component to
Svelte and forget React and Vue.

| Assistant      | Reads                                                               |
| -------------- | ------------------------------------------------------------------- |
| Claude Code    | `CLAUDE.md`, `AGENTS.md`, `.claude/skills/*/SKILL.md`               |
| GitHub Copilot | `.github/copilot-instructions.md`, `AGENTS.md`, `*.instructions.md` |
| Cursor         | `.cursor/rules/*.mdc`, `AGENTS.md`                                  |

## 1. The shared source of truth: `AGENTS.md`

`AGENTS.md` is an emerging cross-tool standard many agents read. Put the durable
facts here once; the tool-specific files stay thin and point at it.

`AGENTS.md` (repo root):

```markdown
# AGENTS.md

## What this repo is

A monorepo for a design system: a Tailwind v4 plugin (all styling) plus Svelte,
React, and Vue component libraries (behavior only) and a SvelteKit docs site.

## Golden rules

1. **All styling lives in the plugin** (`packages/project-name`). Framework
   libraries emit the plugin's class names and add only behavior. Never put
   colors/spacing/radii in a framework component.
2. **Cross-framework parity.** A component change in one library must be made in
   all three (Svelte, React, Vue) with the identical prop → class contract. See
   the shared contract fixture.
3. **Never edit `packages/project-name/generated/`** — it is compiled from
   `src/**` by `functions/build.ts`. Edit the CSS in `src/`, then rebuild.
4. **Changesets are mandatory** for any change to a published package
   (`bun run changeset`). Commit the generated file.
5. **Conventional Commits** are enforced by a git hook. Format:
   `type(scope): summary`. Scopes: plugin, svelte, react, vue, docs, ci, build.

## Layout

- `packages/project-name` — Tailwind plugin; author CSS in `src/`, compiled to
  `generated/`, published as `dist/`.
- `packages/svelte|react|vue` — component libraries; peer-depend on the plugin.
- `packages/docs` — SvelteKit site + theme generator (never published).

## Commands

- `bun install` · `bun run dev` (docs) · `bun run build` · `bun run check`
  · `bun run lint` · `bun run test` · `bun run changeset`.

## Definition of done for a component

Exists in: plugin CSS (`src/components/<name>.css`), all three libraries, the
docs (reference page + live demo), and passes the contract test.
```

## 2. Claude Code

`CLAUDE.md` (root) — Claude reads this automatically. Keep it a thin pointer plus
Claude-specific etiquette:

```markdown
# CLAUDE.md

Read **AGENTS.md** first — it holds the golden rules and layout.

## When asked to add or change a component

Use the `add-component` skill (`.claude/skills/add-component/SKILL.md`). Do not
hand-edit `generated/`. After changes, run `bun run check` and add a changeset.

## Verification

Before claiming done, run the `verify-plugin` skill to confirm the compiled CSS
contains the expected classes.
```

### Claude skills

Skills are folders with a `SKILL.md` that Claude can invoke.
`.claude/skills/add-component/SKILL.md`:

```markdown
---
name: add-component
description: Add a new component to the plugin and all three framework libraries with parity.
---

# Add a component

Given a component name and spec:

1. **Plugin CSS.** Create `packages/project-name/src/components/<name>.css` inside
   `@layer components`. Use design tokens; follow the radius model
   (`var(--rounded-<name>, var(--rounded-field))`). Rebuild: `bun run --filter
'@scope/project-name' build`.
2. **Svelte.** Add `packages/svelte/src/lib/components/<Name>.svelte`, mapping
   props to the plugin classes via `cn`; export it from the barrel; safelist any
   runtime classes.
3. **React.** Add `packages/react/src/components/<Name>.tsx` with `"use client"`,
   `forwardRef`, identical props/classes; export from barrel.
4. **Vue.** Add `packages/vue/src/components/<Name>.vue` with `inheritAttrs:false`
   and explicit `v-bind`; export from barrel.
5. **Contract.** Extend the shared fixture and confirm all three contract tests
   pass.
6. **Docs.** Add a reference page with a live demo.
7. **Release.** `bun run changeset` describing the addition.

Definition of done: `bun run check && bun run test` pass; component present in all
four packages and the docs.
```

`.claude/skills/verify-plugin/SKILL.md`:

```markdown
---
name: verify-plugin
description: Verify the compiled plugin CSS contains expected classes and token chains.
---

# Verify the plugin

1. `bun run --filter '@scope/project-name' build`.
2. Compile the E2E fixture: `bunx @tailwindcss/cli -i packages/project-name/test/fixtures/app.css`.
3. Assert the output contains the component's classes and, for buttons, the
   `var(--rounded-button, var(--rounded-field))` chain.
4. Report any class that is missing or any token that failed to resolve.
```

## 3. GitHub Copilot

`.github/copilot-instructions.md` — Copilot reads this repo-wide:

```markdown
# Copilot instructions

This is a design-system monorepo. **Read AGENTS.md for the golden rules.**

- All styling lives in the Tailwind plugin (`packages/project-name`). Framework
  components emit plugin classes and add only behavior.
- Keep Svelte, React, and Vue implementations of a component in parity — same
  props, same emitted classes.
- Never edit `packages/project-name/generated/` (it is compiled from `src/`).
- Any change to a published package needs a changeset (`bun run changeset`).
- Use Conventional Commits: `type(scope): summary`.
- Prefer `cn(...)` (clsx + tailwind-merge) for all class composition.
```

Path-scoped guidance via `*.instructions.md` (VS Code + Copilot honor the
`applyTo` frontmatter). `.github/instructions/plugin.instructions.md`:

```markdown
---
applyTo: 'packages/project-name/**'
---

Author CSS in `src/`; never touch `generated/`. Register everything through the
Tailwind plugin API in `index.ts`. Follow the token layering and radius fallback
model. Add unit tests for any new extraction helper.
```

`.github/instructions/libraries.instructions.md`:

```markdown
---
applyTo: 'packages/{svelte,react,vue}/**'
---

Components are behavior-only wrappers over plugin classes. Map props to classes
via `cn`, pass the consumer's `class` last, spread native attributes. Keep the
three libraries in parity and update the shared contract fixture.
```

## 4. Cursor

Cursor reads `.mdc` rule files under `.cursor/rules/`. Split by scope with
`globs` frontmatter.

`.cursor/rules/00-always.mdc`:

```markdown
---
description: Core repo rules, always applied.
alwaysApply: true
---

- Read AGENTS.md. All styling lives in the Tailwind plugin; libraries are
  behavior-only and must stay in cross-framework parity.
- Never edit `packages/project-name/generated/`.
- Changesets required for published-package changes; Conventional Commits enforced.
```

`.cursor/rules/10-plugin.mdc`:

```markdown
---
description: Tailwind plugin authoring rules.
globs: packages/project-name/**
---

Author CSS in `src/`, compiled to `generated/` by `functions/build.ts`. Use the
radius fallback model and design tokens. Register via the plugin API in index.ts.
```

`.cursor/rules/20-libraries.mdc`:

```markdown
---
description: Framework library rules.
globs: packages/{svelte,react,vue}/**
---

Emit plugin classes only. Compose with `cn`. Keep Svelte/React/Vue in parity and
update the shared contract fixture and tests.
```

## 5. Keeping the four in sync

The `AGENTS.md`-first pattern means one file holds the truth and the rest are thin
pointers. When a rule changes:

1. Edit `AGENTS.md`.
2. Only touch a tool-specific file if the rule is tool-specific.

Consider a tiny CI check that greps the tool files for a version marker string
present in `AGENTS.md`, failing if they drift — cheap insurance that all four
assistants stay aligned.

## 6. Why this matters for this project specifically

The single biggest risk in a multi-framework design system is **drift**: a
component evolves in one library and the others lag. Encoding "parity is the
definition of done" into every agent's instructions — and giving them an
`add-component` skill that scaffolds all three at once — makes the AI a force for
consistency instead of a source of drift.

## Checklist

- [ ] `AGENTS.md` holds the golden rules and layout (single source of truth).
- [ ] `CLAUDE.md` + `.claude/skills/{add-component,verify-plugin}/SKILL.md`.
- [ ] `.github/copilot-instructions.md` + path-scoped `*.instructions.md`.
- [ ] `.cursor/rules/*.mdc` scoped by globs.
- [ ] Parity and "never edit generated/" rules present in all four.

Next: [11-conventions.md](11-conventions.md).
