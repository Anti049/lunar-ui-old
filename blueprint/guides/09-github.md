# 9. GitHub — CI, publishing, deployment, templates

Ready-to-copy files live in [`../templates/.github/`](../templates/.github/).
This guide explains what each does and why it is shaped that way.

Ten steps. Do them in order — step 10 verifies the lot with one throwaway PR, and
it is much easier to find a mistake then than during a real release.

---

## 1. Lay out `.github/` and set the secrets

```powershell
New-Item -ItemType Directory -Force .github/workflows, .github/ISSUE_TEMPLATE
```

Four workflows, each with one job:

| File                  | Trigger                       | Does                                          |
| --------------------- | ----------------------------- | --------------------------------------------- |
| `ci.yml`              | PR, push to `main`            | lint, typecheck, test, build — the merge gate |
| `release.yml`         | push to `main`                | Version PR, then publish to npm               |
| `docs.yml`            | push to `main` affecting docs | deploy the site                               |
| `changeset-check.yml` | PR                            | fail if a PR has no changeset                 |

Add the secrets now, under **Settings → Secrets and variables → Actions**, so no
workflow fails on its first run for a missing value:

| Secret         | Needed by                 | Notes                                    |
| -------------- | ------------------------- | ---------------------------------------- |
| `NPM_TOKEN`    | `release.yml`             | Granular Access Token, read/write        |
| `GITHUB_TOKEN` | `release.yml`, `docs.yml` | provided automatically, do not create it |

`NPM_TOKEN` must be a **Granular Access Token** with read/write on the packages.
Classic automation tokens still work but cannot do provenance.

---

## 2. Write `ci.yml` — the actual gate

Git hooks are bypassable with `--no-verify` and do not run on a PR opened from
the web UI. **Everything that must hold has to run in CI.**

**`.github/workflows/ci.yml`** — new file.

```yaml
name: CI
on:
  pull_request:
  push: { branches: [main] }

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 } # commitlint needs history
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - name: Lint commit messages
        if: github.event_name == 'pull_request'
        run: bunx commitlint --from origin/${{ github.base_ref }} --to HEAD --verbose
      - run: bun run lint
      - run: bun run check # build + typecheck + tests + publint
```

Three details:

- `bun run check` runs per-package `check`, which for the plugin is
  `build && typecheck && test && publint`. One command, one gate. Keep it that
  way — a CI file that grows its own list of steps drifts from what you can run
  locally.
- `fetch-depth: 0` matters. commitlint compares against the base branch and
  cannot with a shallow clone.
- `cancel-in-progress: true` is right for CI (a superseded push is wasted work)
  and wrong for release (step 3).

---

## 3. Write `release.yml`

**`.github/workflows/release.yml`** — new file.

```yaml
name: Release
on:
  push: { branches: [main] }
  workflow_dispatch:

concurrency: { group: release-main, cancel-in-progress: false }

permissions:
  contents: write
  pull-requests: write
  id-token: write # required for npm provenance

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, registry-url: https://registry.npmjs.org }
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run check # never publish something unverified
      - run: bun run build:packages
      - uses: changesets/action@v1
        with:
          version: bunx changeset version
          publish: bunx changeset publish
          title: 'chore: version packages'
          commit: 'chore: version packages'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
          NPM_CONFIG_PROVENANCE: true
```

**Run `check` here, not just `build`.** A release workflow that only builds will
happily publish a plugin whose output no longer matches its source — which is
exactly the failure the test suite exists to catch.

`concurrency` without `cancel-in-progress` is deliberate: cancelling a release
midway can leave some packages published and others not.

`setup-node` is present alongside Bun purely for `registry-url` — it writes the
`.npmrc` that `changeset publish` authenticates with. Without it the publish
fails with a 401 that reads like a bad token.

---

## 4. Write `docs.yml`

The site deploys to **GitHub Pages**: free, no external account, and nothing
about a documentation site needs a server. The cost is that it is served from a
subpath (`/project-name/`), which [guide 7](07-docs.md) handles with
`paths.base` and `adapter-static`.

**`.github/workflows/docs.yml`** — new file.

```yaml
name: Docs
on:
  push:
    branches: [main]
    # Gate on paths, so a plugin-only commit does not redeploy the site.
    # packages/core/** IS included: the site renders the plugin's own registry,
    # so a plugin change does change the site.
    paths: ['packages/docs/**', 'packages/core/**', '.github/workflows/docs.yml']
  # So you can redeploy without an empty commit.
  workflow_dispatch:

# Required by deploy-pages. `contents: read` alone is not enough.
permissions:
  contents: read
  pages: write
  id-token: write

# One deployment at a time, and never cancel one midway.
concurrency: { group: pages, cancel-in-progress: false }

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile

      # The plugin must be built before the site, which imports its registry.
      - run: bun run --filter '@scope/project-name' build

      - run: bun run --filter '@scope/project-name-docs' build
        env:
          # Pages serves from /<repo>/, and SvelteKit needs to know at BUILD
          # time. Read in svelte.config.js - see guide 7.
          BASE_PATH: /${{ github.event.repository.name }}

      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        # adapter-static writes here; `pages` in svelte.config.js must agree.
        with: { path: packages/docs/build }
      - id: deployment
        uses: actions/deploy-pages@v4
```

**Set the source before the first run.** **Settings > Pages > Source** must be
**"GitHub Actions"**, not "Deploy from a branch". The workflow cannot set this
for you, and until it is set `deploy-pages` fails with an error that never
mentions the setting.

Include `packages/core/**` — the site renders the plugin's own registry, so a
plugin change does change the site.

---

## 5. Write `changeset-check.yml`

**`.github/workflows/changeset-check.yml`** — new file.

```yaml
name: Changeset
on: pull_request
jobs:
  check:
    runs-on: ubuntu-latest
    if: "!contains(github.event.pull_request.labels.*.name, 'skip-changeset')"
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bunx changeset status --since=origin/${{ github.base_ref }}
```

The `skip-changeset` label is the escape hatch for docs-only and CI-only PRs.
Create the label now — a label referenced by a workflow but never created works
fine, but nobody can find it when they need it.

---

## 6. Add the issue templates

Use the YAML forms, not markdown — they produce structured, searchable issues and
you can make fields required. Full files are in
[`../templates/.github/ISSUE_TEMPLATE/`](../templates/.github/ISSUE_TEMPLATE/).

| Template        | Captures                                         |
| --------------- | ------------------------------------------------ |
| `bug.yml`       | package, version, reproduction, Tailwind version |
| `component.yml` | proposed component, which frameworks, prior art  |
| `docs.yml`      | page, what is wrong or missing                   |
| `a11y.yml`      | component, assistive tech, WCAG criterion        |
| `config.yml`    | disables blank issues, points at Discussions     |

The single most useful field on the bug form is **"which package"** as a
dropdown. Most reports that stall do so because nobody can tell whether the
problem is in the plugin or in a binding.

Two required fields, no more. Every extra required field costs you reports from
the people least likely to file a second one.

---

## 7. Add the PR template and community health files

| File                       | Why                                                    |
| -------------------------- | ------------------------------------------------------ |
| `CONTRIBUTING.md`          | setup, the commit format, how to add a component       |
| `CODE_OF_CONDUCT.md`       | Contributor Covenant; GitHub surfaces it automatically |
| `SECURITY.md`              | where to report privately, and your response window    |
| `pull_request_template.md` | changeset checkbox, screenshots, a11y checklist        |
| `FUNDING.yml`              | if relevant                                            |

`CONTRIBUTING.md` should carry the "what counts as breaking" list from
[guide 8](08-conventions.md) verbatim. It is the paragraph reviewers forget and
first-time contributors most need.

---

## 8. Add Dependabot and CODEOWNERS

**`.github/dependabot.yml`** — new file. One that groups is the difference
between useful and ignored:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule: { interval: weekly }
    open-pull-requests-limit: 5
    groups:
      dev-dependencies:
        dependency-type: development
      tailwind:
        patterns: ['tailwindcss', '@tailwindcss/*']
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: monthly }
```

The second entry is easy to forget and is the one that keeps `actions/checkout@v4`
from silently aging out.

**`.github/CODEOWNERS`** — new file. It routes review by package:

```text
/packages/core/    @acme/design-system
/packages/svelte/  @acme/svelte
/packages/react/   @acme/react
/packages/vue/     @acme/vue
/.github/          @acme/maintainers
```

Dependabot PRs still need a changeset or the `skip-changeset` label. Add the
label to the `groups` config or accept that you will apply it by hand weekly.

---

## 9. Lock down repository settings

Set these once, in the web UI:

- **Branch protection on `main`**: require `verify` and `check` to pass, require
  a PR, no force-push, no deletion.
- **Tag protection** on `v*` — a force-pushed tag over a published version is
  unrecoverable.
- **Auto-delete head branches** after merge.
- **Actions permissions**: read-only by default; the release workflow asks for
  what it needs explicitly.
- **Environments**: an `npm` environment with a required reviewer if you want a
  human gate on publishing.

Branch protection must name checks **exactly as the job renders them** — the job
name, not the workflow name. Open one PR first (step 10), let the checks run, and
pick the names from the list GitHub then offers. Typing them by hand produces a
required check that never reports and a PR that can never merge.

---

## 10. Verify with one throwaway PR

```powershell
git switch -c chore/verify-ci
git commit --allow-empty -m "chore(repo): verify CI"
git push -u origin chore/verify-ci
gh pr create --fill
```

Watch for four things:

1. `CI / verify` runs and passes.
2. `Changeset / check` runs and **fails** — you did not write one. That is the
   check working.
3. `bun changeset --empty`, commit, push — it goes green.
4. `docs.yml` does **not** run, because no doc path changed.

Then merge it and confirm `release.yml` runs and opens nothing (there are no real
changesets). Close the loop before you rely on it.

---

## Files after this phase

| File                                    | Status | Written in | Next touched by                  |
| --------------------------------------- | ------ | ---------- | -------------------------------- |
| `.github/workflows/ci.yml`              | added  | step 2     | [10](10-ai-agents.md) — one step |
| `.github/workflows/release.yml`         | added  | step 3     | never                            |
| `.github/workflows/docs.yml`            | added  | step 4     | never                            |
| `.github/workflows/changeset-check.yml` | added  | step 5     | never                            |
| `.github/ISSUE_TEMPLATE/bug.yml`        | added  | step 6     | as the package list grows        |
| `.github/ISSUE_TEMPLATE/component.yml`  | added  | step 6     | never                            |
| `.github/ISSUE_TEMPLATE/config.yml`     | added  | step 6     | never                            |
| `.github/pull_request_template.md`      | added  | step 7     | never                            |
| `.github/CONTRIBUTING.md`               | added  | step 7     | as conventions change            |
| `.github/CODE_OF_CONDUCT.md`            | added  | step 7     | never                            |
| `.github/SECURITY.md`                   | added  | step 7     | never                            |
| `.github/dependabot.yml`                | added  | step 8     | never                            |
| `.github/CODEOWNERS`                    | added  | step 8     | as teams change                  |

Ready-to-copy copies of all of these are in
[`../templates/.github/`](../templates/.github/). The three workflows are given
in full in steps 2–5 and are not repeated here; the rest follow.

Not files: the repository settings in step 9 and the `skip-changeset` label
from step 5 are configured in the web UI and cannot be committed. Write them
down in `CONTRIBUTING.md` — they are invisible to anyone reading the repository.

---

### `.github/ISSUE_TEMPLATE/bug.yml`

```yaml
name: Bug report
description: Something renders or behaves incorrectly.
labels: ['bug', 'triage']
body:
  - type: dropdown
    id: package
    attributes:
      label: Which package
      # The single most useful field on this form. Most reports that stall do
      # so because nobody can tell whether the problem is in the plugin or in a
      # binding.
      options:
        - '@scope/project-name (the plugin)'
        - '@scope/project-name-svelte'
        - '@scope/project-name-react'
        - '@scope/project-name-vue'
        - 'Not sure'
    validations: { required: true }

  - type: input
    id: version
    attributes:
      label: Version
      placeholder: '2.1.0'
    validations: { required: true }

  - type: input
    id: tailwind
    attributes:
      label: Tailwind version
      description: '`npm ls tailwindcss`'
      placeholder: '4.3.3'
    validations: { required: false }

  - type: textarea
    id: reproduction
    attributes:
      label: Reproduction
      description: A link to a minimal repository, or the CSS and markup needed.
    validations: { required: true }

  - type: textarea
    id: expected
    attributes:
      label: What you expected
    validations: { required: false }
```

**Three required fields, no more.** Every extra required field costs you reports
from the people least likely to file a second one.

---

### `.github/ISSUE_TEMPLATE/component.yml`

```yaml
name: Component request
description: Propose a new component.
labels: ['component', 'triage']
body:
  - type: input
    id: name
    attributes:
      label: Component name
    validations: { required: true }

  - type: checkboxes
    id: frameworks
    attributes:
      label: Which bindings need it
      options:
        - label: Svelte
        - label: React
        - label: Vue

  - type: textarea
    id: prior-art
    attributes:
      label: Prior art
      description: Links to the same component elsewhere, and what they get right or wrong.
    validations: { required: false }
```

---

### `.github/ISSUE_TEMPLATE/config.yml`

```yaml
# Forces every issue through a template. Without this, "Open a blank issue"
# stays available and most reports arrive that way.
blank_issues_enabled: false
contact_links:
  - name: Question or idea
    url: https://github.com/acme/project-name/discussions
    about: Anything that is not a bug report or a concrete proposal.
```

---

### `.github/pull_request_template.md`

```markdown
## What this changes

<!-- One or two sentences. The changeset carries the user-facing wording. -->

## Checklist

- [ ] `bun run check` passes
- [ ] A changeset is included, or the PR is labelled `skip-changeset`
- [ ] Screenshots, if anything visual changed
- [ ] Keyboard and screen-reader behaviour considered, if a component changed

## Breaking?

<!--
  Renaming or removing ANY emitted class or token is breaking, as is changing
  a layer's depth. See CONTRIBUTING.md.
-->
```

---

### `.github/dependabot.yml`

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule: { interval: weekly }
    open-pull-requests-limit: 5
    # Grouping is the difference between useful and ignored: ungrouped, this
    # opens thirty PRs a week and you stop reading them.
    groups:
      dev-dependencies:
        dependency-type: development
      tailwind:
        patterns: ['tailwindcss', '@tailwindcss/*']

  # Easy to forget, and the one that keeps actions/checkout@v4 from aging out.
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: monthly }
```

Dependabot PRs still need a changeset or the `skip-changeset` label. Nothing
applies it automatically — either accept applying it weekly, or add a small
workflow that labels PRs opened by `dependabot[bot]`.

---

### `.github/CODEOWNERS`

```text
# Review routing. The last matching pattern wins, so order from general to
# specific.
*                   @acme/maintainers

/packages/core/     @acme/design-system
/packages/svelte/   @acme/svelte
/packages/react/    @acme/react
/packages/vue/      @acme/vue
/packages/docs/     @acme/docs

/.github/           @acme/maintainers
/blueprint/         @acme/maintainers
```

CODEOWNERS only enforces anything once branch protection requires review from
code owners (step 9). Without that it is documentation.

---

### `.github/CONTRIBUTING.md`

The one file here worth writing rather than copying, because it is where the
things that live in the web UI get written down.

```markdown
# Contributing

## Setup

    bun install
    bun run --filter '@scope/project-name' build   # generated/ must exist first
    bun run check

    git config commit.template .gitmessage

## Commits

Conventional Commits, enforced by a hook and again in CI.
Scopes: `core`, `svelte`, `react`, `vue`, `docs`, `repo`, `deps`.

## Every PR needs a changeset

    bun changeset

…unless it genuinely ships nothing to a consumer, in which case label it
`skip-changeset`.

## What counts as breaking

The CSS class names and tokens are public API. Treat as breaking:

- renaming or removing any emitted class
- renaming a `--theme-color-*` or shape token
- changing an `@plugin` option name, or rejecting one that used to be ignored
- changing a cascade layer's depth or name — it changes what overrides what
- narrowing a peer dependency range
- removing an `exports` subpath

Not breaking: adding a class, a token or an option; changing a build script;
anything inside `generated/`.
```

That last section is copied verbatim from [guide 8](08-conventions.md) step 2.
It is the single most useful paragraph you can give a first-time contributor,
and the one reviewers forget.

`CODE_OF_CONDUCT.md` is the Contributor Covenant, unmodified except for the
contact address — GitHub surfaces it automatically once present.
`SECURITY.md` needs only where to report privately and your response window.

---

## Traps

> **A release workflow that only builds.** See step 3. Build success says nothing
> about correctness.

> **`bun install` without `--frozen-lockfile` in CI.** It will happily resolve a
> newer transitive dependency than the one you tested against, so CI and local
> disagree in ways that look like flakes.

> **Provenance without `id-token: write`.** `NPM_CONFIG_PROVENANCE: true` fails
> the publish rather than silently skipping. Both must be present.

> **GitHub Pages and absolute links.** Every internal link needs the base path.
> SvelteKit's `resolve()` handles it; a hand-written `href="/components"` will
> 404 on Pages and work locally, which is the worst possible combination.
>
> **How to tell:** the deployed site's home page works and every link from it
> 404s. `bun run preview` reproduces it only if `BASE_PATH` was set for the
> build — which is why [guide 7](07-docs.md) step 11 tells you to set it.

> **A required status check that never reports.** Branch protection matches job
> names literally, so a renamed job leaves every PR stuck on "Expected — waiting
> for status". Nothing tells you; it just never goes green.
>
> **Fix:** re-pick the check names after renaming any job.

---

## Commit

```powershell
git add -A
git commit -m "ci(repo): add CI, release and docs workflows"
```

Push this one to a **branch** and open a PR, even though `main` is not yet
protected — it is the only way to see the workflows run, and step 10 walks
through exactly what to look for.

Turn on branch protection only **after** that PR is green. Enabling it first
means the required checks have never reported, so nothing can merge and you
have to unpick it from the settings UI.
---

Next: [AI agents](10-ai-agents.md)
