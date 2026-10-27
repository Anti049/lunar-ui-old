# Building a Tailwind design-system monorepo from scratch

A complete blueprint for a repository that ships one design system as a Tailwind
CSS v4 plugin plus Svelte, React and Vue bindings, documented by its own site.

This is written as a build order, not a reference. Each guide assumes the one
before it has been done. Where a step has a trap in it — and several do, badly —
the trap is called out inline with what it looks like when you hit it, because
most of them fail silently.

Throughout, `@anti049`, `test` and `Anti049` are placeholders — your npm
scope, your package name and your GitHub owner. Pick them before you start
(see [Name it once](guides/00-prerequisites.md#name-it-once-and-substitute));
renaming later touches every package manifest, every import in the docs site,
and the published registry.

`blueprint/personalise.ts` substitutes all three throughout these guides, so
every command becomes copy-pasteable:

```powershell
bun blueprint/personalise.ts --scope '@Anti049' --name moonlight --owner Anti049 --dry-run
```

---

## What you end up with

```text
test/
├─ packages/
│  ├─ core/        @anti049/test          the Tailwind plugin
│  ├─ svelte/      @anti049/test-svelte   Svelte 5 components
│  ├─ react/       @anti049/test-react    React 19 components
│  ├─ vue/         @anti049/test-vue      Vue 3.5 components
│  └─ docs/        private                      the documentation site
├─ .github/        workflows, issue templates, agent instructions
├─ .vscode/        debugging, enforced conventions, recommended extensions
└─ blueprint/      this directory — delete it once you have read it
```

Five packages, four published, one private. The plugin is the product; the three
framework packages are thin bindings over it; the docs site consumes all four the
way a real consumer would.

---

## The order to do it in

| #   | Guide                                                     | What you get                                                  |
| --- | --------------------------------------------------------- | ------------------------------------------------------------- |
| 0   | [Prerequisites and decisions](guides/00-prerequisites.md) | Toolchain, and the five choices that are expensive to reverse |
| 1   | [Monorepo skeleton](guides/01-monorepo.md)                | Workspaces, shared config, the root scripts                   |
| 2   | [The Tailwind plugin](guides/02-plugin.md)                | CSS source → compiled JS plugin, the hardest part             |
| 3   | [Bindings: the shared contract](guides/03-bindings.md)    | The five rules all three framework packages follow            |
| 4   | [Svelte bindings](guides/04-svelte.md)                    | `sv create --template library`, `svelte-package`              |
| 5   | [React bindings](guides/05-react.md)                      | `create-vite`, `tsup`, dual ESM/CJS output                    |
| 6   | [Vue bindings](guides/06-vue.md)                          | `create-vite`, Vite library mode, `vue-tsc`                   |
| 7   | [The docs site](guides/07-docs.md)                        | SvelteKit site on Pages, live-reload against plugin source    |
| 8   | [Conventions](guides/08-conventions.md)                   | Conventional Commits, SemVer, Changesets, changelogs          |
| 9   | [GitHub](guides/09-github.md)                             | CI, publishing, GitHub Pages deploy, issue templates          |
| 10  | [AI agents](guides/10-ai-agents.md)                       | Claude Code, Copilot and Cursor instructions that agree       |
| 11  | [Debugging](guides/11-debugging.md)                       | Client and server breakpoints inside VS Code                  |
| 12  | [Testing](guides/12-testing.md)                           | The differential harness that keeps the plugin honest         |
| 13  | [Release and operations](guides/13-release.md)            | Publishing, rollback, provenance, deprecation                 |

Guides 14–16 extend the plugin. They are numbered after 13 so the earlier
guides' cross-references stay stable, but they are **done straight after
[guide 2](guides/02-plugin.md)** — guide 2 gives you a plugin that ships
components, and these three give it tokens, themes and an option surface.

Among themselves they go in order: themes are built on the token layer, and the
option surface is built on both.

| #   | Guide                                             | What you get                                                         |
| --- | ------------------------------------------------- | -------------------------------------------------------------------- |
| 14  | [The token layer](guides/14-tokens.md)            | Standalone tokens, the `theme.extend` bridge, shape tokens           |
| 15  | [Themes](guides/15-themes.md)                     | Palettes generated from a seed, the catalogue, the generator         |
| 16  | [The plugin option surface](guides/16-options.md) | `prefix`, `include`/`exclude`, `themes`, variants, `@utility name-*` |

And one last guide, which belongs at the end because it needs everything else to
exist first:

| #   | Guide                               | What you get                                                          |
| --- | ----------------------------------- | --------------------------------------------------------------------- |
| 17  | [Rehearsal](guides/17-rehearsal.md) | Packed tarballs installed into a scratch app, every feature exercised |

Run it before the first publish without exception. It is the only check that
sees what a consumer sees — everything else tests from inside the workspace,
where your packages resolve by symlink.

Then the planning material:

- [Roadmap](roadmap/README.md) — milestones and issues, readable as a document
- [Importing the roadmap](roadmap/IMPORT.md) — getting it into GitHub with `gh`
- [`milestones.json`](roadmap/milestones.json) / [`issues.json`](roadmap/issues.json) — the machine-readable copies

And the copy-paste material in [`templates/`](templates/), which mirrors the
final `.github/` and `.vscode/` directories exactly.

---

## Why a plugin rather than a stylesheet

This is the decision the whole repository is shaped around, so it is worth being
explicit about what it buys and what it costs.

A stylesheet is simpler in every way. You write CSS, the consumer writes
`@import`, and that is the end of it. What you cannot do is take options. There
is no way for a consumer to say "prefix every class", "ship only the four
components I use", or "give me these two themes and not the other thirty-three",
because `@import` has no arguments.

A plugin gets you all three, at the cost of your CSS no longer being CSS by the
time anyone consumes it. You need a build step that compiles stylesheets into
JavaScript objects, and a test that proves the compiled form still means what the
source said. That test is not optional — see [Testing](guides/12-testing.md).

**Ship both only if you have a no-build-step audience.** Doing so roughly doubles
the build surface: a second code-generation path, a second artifact to validate,
and — because a plain stylesheet cannot be usage-gated — every responsive variant
pre-expanded into the file. That last point is not a small tax; it is the
difference between a 150 KB stylesheet and a 1 MB one.

---

## How to read a step

Every code block is preceded by a bold path and a placement instruction, so you
never have to infer where something goes:

> **`packages/core/functions/build.ts`** — append below `runTailwind()`

The placements are **new file**, **append**, **replace the whole file**, or a
named anchor inside the file. A block with no path is either a continuation of
the file named just above it, or an illustrative snippet — and the illustrative
ones say so, usually because they show what a _consumer_ writes rather than
something in your repository.

Each guide ends with **Files after this phase**: every file it created or
changed, what touches it next, and the complete contents of each. Files
assembled across several steps — `build.ts` is put together in five — appear
there in one piece.

Then a **Checkpoint**: the gate before the next guide. Each one builds a
throwaway skeleton project under `$env:TEMP\test-checkpoint` — a bare Tailwind
consumer, a real SvelteKit, React or Vue app, a fresh clone, a sandbox GitHub
repository, a local npm registry — and checks the guide's work from the
outside, where nothing resolves through the workspace. Every check says what
it must print, and every skeleton is deleted at the end.

---

## Committing as you go

**Commit once per guide, not once per step.** Each guide ends with a `## Commit`
section giving the verify command and the exact message. A guide is a coherent
unit of work — half of guide 2 is a plugin that cannot compile, so there is
nothing useful to come back to.

The rhythm changes twice:

| Guides | Where it goes                 | Needs a changeset?             |
| ------ | ----------------------------- | ------------------------------ |
| 1–7    | straight to `main`            | no — nothing is published yet  |
| 8      | straight to `main`            | no — repository tooling only   |
| 9–16   | a branch, then a pull request | only if consumers are affected |

[Guide 8](guides/08-conventions.md) installs the `commit-msg` hook, so from that
point a message that is not a Conventional Commit is rejected outright.
[Guide 9](guides/09-github.md) turns on branch protection and the
changeset-required workflow, so from there everything goes through a PR and
anything that does not affect consumers needs the `skip-changeset` label.

Two things never to commit: `packages/core/generated/` and any `dist/`. Both are
reproducible from source, and both produce merge conflicts that cannot be
resolved by reading them. `git status` before every commit until that is a
habit.

---

## How to read the traps

Every guide has a **Traps** section. They are not hypothetical. Each one is
written as:

> **What you do** → **what you expect** → **what actually happens** → **how to
> tell**.

They are there because almost all of them fail _silently_: the build succeeds,
the output looks plausible, and the breakage shows up in a consumer's app weeks
later. The single most valuable habit in this repository is refusing to believe
that something works because it compiled.

---

## Conventions used in this blueprint

- Commands assume `bun`. Every one has an `npm`/`pnpm` equivalent; where the
  behaviour differs in a way that matters, it is called out.
- File paths are relative to the repository root unless shown otherwise.
- `@anti049` is your npm scope or organisation. Unscoped names work too, but you
  will fight for them on the registry.
- Version numbers in the roadmap are _projected_, not promised. They exist so the
  milestone list has a shape, not so you are held to them.
