# 07 — Roadmap: Milestones & Issues

This chapter is the project plan. It is written so you can **read it as-is** to
understand the sequence of work, and also **import it into GitHub** as milestones
and issues with a single script.

- Human-readable plan: this file.
- Machine-readable data: [roadmap/milestones.json](roadmap/milestones.json) and
  [roadmap/issues.json](roadmap/issues.json).
- Importer: [roadmap/import.ts](roadmap/import.ts) (and manual `gh` commands in
  [roadmap/IMPORT.md](roadmap/IMPORT.md)).

## 1. Versioning strategy for the roadmap

Milestones map to SemVer releases of the **published packages** (the plugin and
the three framework libraries version in lockstep — see
[11-conventions.md](11-conventions.md)). The docs site is unversioned; it
continuously deploys.

| Milestone | Target version | Theme                                              |
| --------- | -------------- | -------------------------------------------------- |
| M1        | `v0.1.0`       | Monorepo foundation & the plugin's core tokens.    |
| M2        | `v0.2.0`       | Plugin component CSS + the Svelte library.         |
| M3        | `v0.3.0`       | React library at parity.                           |
| M4        | `v0.4.0`       | Vue library at parity.                             |
| M5        | `v0.5.0`       | Docs site + live theme generator.                  |
| M6        | `v0.9.0`       | CI/CD, publishing, and deploys automated.          |
| M7        | `v1.0.0`       | Stabilization, a11y audit, docs polish, 1.0.       |
| M8        | `v1.1.0+`      | Post-1.0 expansion (more components, more themes). |

`0.x` communicates "pre-stable; minor may break". `1.0.0` is the compatibility
promise.

## 2. Milestones in detail

### M1 — Foundation (`v0.1.0`)

Everything in [01-monorepo-setup.md](01-monorepo-setup.md) plus the plugin's
token layer.

- Bun workspace, shared TS/ESLint/Prettier/EditorConfig.
- Husky + commitlint + lint-staged.
- Plugin package skeleton; design tokens (`@theme`), `@property` registrations.
- The `default` theme; Material Color Utilities wired into the build.
- Unit-test harness for the extraction pipeline.

**Exit criteria:** `bun install && bun run lint` clean; plugin builds `generated/`
and `dist/`; a fixture app compiles `bg-primary`.

### M2 — Plugin components + Svelte (`v0.2.0`)

- Component CSS for the initial set (button, card, input, checkbox, badge…).
- The layered border-radius model implemented and E2E-tested.
- Svelte library: `cn`, `Button`, ripple action, `styles.css`, barrel export.
- Shared prop→class contract fixture and Svelte contract test.

**Exit criteria:** docs (even minimal) renders live Svelte components;
`exclude`/`include`/`prefix` options tested.

### M3 — React parity (`v0.3.0`)

- React library mirroring Svelte's API 1:1 (`tsup` build, `"use client"`).
- `useRipple`; contract test green for React.

**Exit criteria:** React `Button` passes the shared contract fixture.

### M4 — Vue parity (`v0.4.0`)

- Vue library (Vite lib mode, `vue-tsc`), ripple directive, optional `app.use()`.
- Contract test green for Vue.

**Exit criteria:** all three libraries pass the same contract fixture.

### M5 — Docs & theme generator (`v0.5.0`)

- Full docs IA: installation, usage, per-component reference with live demos.
- Shiki code blocks with copy; light/dark toggle.
- **Live theme generator** producing copyable CSS from a seed color.
- Plugin live-reload during `vite dev`.

**Exit criteria:** generator output pasted into a fresh app reproduces the
previewed theme exactly.

### M6 — Automation (`v0.9.0`)

- CI matrix (lint, typecheck, unit, e2e, build, publint) on every PR.
- Changesets release workflow → npm with provenance.
- Docs deploy to Cloudflare Workers and/or GitHub Pages.
- Dependabot, issue/PR templates, CODEOWNERS, SECURITY, CONTRIBUTING.

**Exit criteria:** merging a changeset publishes all four packages; docs auto-deploy.

### M7 — 1.0 (`v1.0.0`)

- Accessibility audit (keyboard, ARIA, contrast) across components.
- API review and freeze; migration notes for any pre-1.0 breaks.
- Docs polish, examples, and a getting-started tutorial.

**Exit criteria:** no known a11y regressions; public API documented and stable.

### M8 — Post-1.0 expansion (`v1.1.0+`)

- Additional components (menu, dialog, tabs, tooltip, data table…).
- Additional shipped themes and a theme marketplace page.
- Optional framework targets (Solid, Angular) using the same contract.

## 3. Issue catalog (excerpt)

The full set lives in [roadmap/issues.json](roadmap/issues.json). Each issue has
a title, body, labels, and a milestone. A representative slice:

| #   | Title                                              | Milestone | Labels                     |
| --- | -------------------------------------------------- | --------- | -------------------------- |
| 1   | Initialize Bun workspace and shared tooling        | M1        | `area:build`, `type:chore` |
| 2   | Wire Husky + commitlint + lint-staged              | M1        | `area:build`, `type:chore` |
| 3   | Author design tokens and `@property` registrations | M1        | `area:plugin`, `type:feat` |
| 4   | Build the CSS→data compile pipeline                | M1        | `area:plugin`, `type:feat` |
| 5   | Implement layered border-radius for buttons        | M2        | `area:plugin`, `type:feat` |
| 6   | Svelte `Button` + ripple action                    | M2        | `area:svelte`, `type:feat` |
| 7   | React `Button` + `useRipple`                       | M3        | `area:react`, `type:feat`  |
| 8   | Vue `Button` + ripple directive                    | M4        | `area:vue`, `type:feat`    |
| 9   | Live theme generator page                          | M5        | `area:docs`, `type:feat`   |
| 10  | Changesets release workflow                        | M6        | `area:ci`, `type:chore`    |
| 11  | Docs deploy: Cloudflare + Pages                    | M6        | `area:ci`, `type:chore`    |
| 12  | Accessibility audit for 1.0                        | M7        | `area:a11y`, `type:chore`  |

## 4. Label taxonomy

Define these once (the importer creates them):

- **`area:*`** — `plugin`, `svelte`, `react`, `vue`, `docs`, `ci`, `build`, `a11y`.
- **`type:*`** — `feat`, `fix`, `chore`, `docs`, `refactor`, `test`.
- **Priority** — `p0`, `p1`, `p2`.
- **Meta** — `good first issue`, `help wanted`, `blocked`.

## 5. Importing into GitHub

Two ways, both documented. Full commands and the script are in
[roadmap/IMPORT.md](roadmap/IMPORT.md).

### Option A — the script (recommended)

Uses the GitHub CLI under the hood; creates labels, milestones, then issues,
mapping each issue to its milestone.

```sh
gh auth login                          # once
export GH_REPO=your-org/project-name   # target repo
bun handbook/roadmap/import.ts         # creates labels, milestones, issues
```

### Option B — pure `gh` commands

For a milestone and one issue, without the script:

```sh
# Milestones use the REST API (gh has no first-class milestone command).
gh api repos/$GH_REPO/milestones -f title='v0.1.0 — Foundation' \
  -f description='Monorepo foundation & plugin core tokens.'

# Then create an issue against it (milestone referenced by number).
gh issue create --repo "$GH_REPO" \
  --title 'Initialize Bun workspace and shared tooling' \
  --body 'See handbook/01-monorepo-setup.md' \
  --label 'area:build,type:chore' \
  --milestone 'v0.1.0 — Foundation'
```

> The importer is idempotent-ish: it skips labels/milestones that already exist
> and will not de-duplicate issues, so run it against a fresh repo. See the
> safety notes in [roadmap/IMPORT.md](roadmap/IMPORT.md).

Next: [08-github-workflows.md](08-github-workflows.md).
