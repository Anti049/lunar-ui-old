# Building a Design-System Monorepo From Scratch

This handbook is a complete, self-contained walkthrough for building a
multi-package design-system monorepo from an empty directory. It documents every
phase of the work: the tooling decisions, the folder layout, the build
pipelines, the release process, the CI/CD, the AI-agent scaffolding, and the
day-to-day developer workflow.

It is written to be followed linearly by someone who has never seen the project
before, but each chapter also stands on its own as a reference.

## What you are building

A single Git repository (a *monorepo*) that ships five packages:

| Package               | Specifier (example)      | Published? | Role                                                                  |
| --------------------- | ------------------------ | ---------- | --------------------------------------------------------------------- |
| Plugin                | `@scope/project-name`    | Yes (npm)  | Framework-agnostic Tailwind CSS v4 plugin: tokens, themes, component CSS. |
| Svelte library        | `@scope/project-name-svelte` | Yes (npm)  | Svelte 5 components built on top of the plugin's classes.              |
| React library         | `@scope/project-name-react`  | Yes (npm)  | React 19 components built on top of the plugin's classes.             |
| Vue library           | `@scope/project-name-vue`    | Yes (npm)  | Vue 3 components built on top of the plugin's classes.                |
| Docs site             | `@scope/project-name-docs`   | No         | SvelteKit site that documents and demos everything, plus a live theme generator. |

> **Naming.** Throughout this handbook, replace `@scope` with your npm
> organization (for example `@acme`) and `project-name` with your product name
> (for example `lumen`). The user prompt describes these as `project-name`,
> `project-name/svelte`, etc.; npm scoped packages cannot nest, so the real
> package names are `@scope/project-name`, `@scope/project-name-svelte`, and so
> on. Their *import ergonomics* still read like subpaths (`@scope/project-name`,
> `@scope/project-name/svelte` via export maps if you prefer — both approaches
> are covered in [02-plugin-package.md](02-plugin-package.md)).

## The core idea

One package owns *all* the visual design — colors, spacing, radii, elevation,
motion, and the per-component CSS — as a **Tailwind v4 plugin**. The three
framework libraries (Svelte, React, Vue) contain **no styling logic of their
own**: they are thin behavioral wrappers that emit the plugin's class names.
This means:

- A visual change happens in exactly one place and every framework inherits it.
- The framework libraries stay tiny and are trivial to keep in sync.
- Consumers who do not want components can use the plugin alone.

## How to read this handbook

Follow the chapters in order the first time. Later, jump straight to whatever
you need.

| Chapter                                                | What it covers                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| [00-overview.md](00-overview.md)                       | Architecture, technology choices, and the reasoning behind them.               |
| [01-monorepo-setup.md](01-monorepo-setup.md)           | Empty folder → working workspace: Bun, TypeScript, ESLint, Prettier, Git.      |
| [02-plugin-package.md](02-plugin-package.md)           | The Tailwind v4 plugin: authoring CSS, the compile pipeline, themes, exports.  |
| [03-svelte-package.md](03-svelte-package.md)           | Svelte 5 component library, `svelte-package`, `styles.css`.                    |
| [04-react-package.md](04-react-package.md)             | React 19 component library, `tsup`/`tsc` build, `"use client"`.               |
| [05-vue-package.md](05-vue-package.md)                 | Vue 3 component library, `vue-tsc` + Vite library mode.                        |
| [06-docs-site.md](06-docs-site.md)                     | SvelteKit docs site, live-reload of the plugin, and the theme generator.       |
| [07-issues-milestones.md](07-issues-milestones.md)     | The full roadmap as human-readable milestones and importable GitHub issues.    |
| [08-github-workflows.md](08-github-workflows.md)       | CI, npm publishing via Changesets, GitHub Pages, and Cloudflare deploys.       |
| [09-github-artifacts.md](09-github-artifacts.md)       | Issue/PR templates, CODEOWNERS, Dependabot, SECURITY, CONTRIBUTING, funding.   |
| [10-ai-agents.md](10-ai-agents.md)                     | Claude Code, GitHub Copilot, and Cursor scaffolding and shared skills.         |
| [11-conventions.md](11-conventions.md)                 | SemVer, Conventional Commits, changelogs, releases, and VS Code enforcement.   |
| [12-debugging.md](12-debugging.md)                     | Debugging the docs site — client and server — entirely inside VS Code.         |

Supporting material lives in [roadmap/](roadmap/): machine-readable
`milestones.json` and `issues.json`, plus an import script and commands.

## Prerequisites at a glance

You will install these in [01-monorepo-setup.md](01-monorepo-setup.md); listed
here so you know what you are getting into.

- **Bun** ≥ 1.2 — package manager, task runner, and test runner.
- **Node.js** ≥ 20 — some tooling and CI steps still shell out to Node.
- **Git** and a **GitHub account** with permission to create a repository.
- **VS Code** — the recommended editor; several chapters configure it directly.
- An **npm account** in an organization/scope you control, for publishing.
- Optionally a **Cloudflare account**, if you deploy the docs to Workers.

## Conventions used in this handbook

- Shell commands are shown for a POSIX shell and for PowerShell where they
  differ (Windows developers are first-class here).
- File paths are always relative to the repository root unless stated otherwise.
- `# ...` in a code block marks an omission for brevity, never literal code.
- Every configuration file is shown in full at least once so you can copy it.
