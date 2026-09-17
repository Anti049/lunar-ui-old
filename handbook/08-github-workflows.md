# 08 — GitHub Workflows: CI, Publishing & Deployment

Every automated process lives in `.github/workflows/`. This chapter builds four:

| Workflow              | Trigger        | Purpose                                     |
| --------------------- | -------------- | ------------------------------------------- |
| `ci.yml`              | PRs, pushes    | Lint, typecheck, test, build, `publint`.    |
| `release.yml`         | push to `main` | Version PR, then publish packages to npm.   |
| `docs-cloudflare.yml` | push to `main` | Deploy the docs site to Cloudflare Workers. |
| `docs-pages.yml`      | push to `main` | Deploy the docs site to GitHub Pages.       |

Run the Cloudflare workflow _or_ the Pages workflow _or_ both — they are
independent. Both are documented in full so you can choose.

## 1. Shared setup: a composite action

Every job installs Bun + Node and the dependencies. Factor it into a composite
action so the workflows stay short and consistent.

`.github/actions/setup/action.yml`:

```yaml
name: Setup
description: Install Bun, Node, and project dependencies (frozen lockfile).
runs:
  using: composite
  steps:
    - uses: oven-sh/setup-bun@v2
      with: { bun-version: '1.2.0' }
    - uses: actions/setup-node@v4
      with:
        node-version: 20
        registry-url: https://registry.npmjs.org
    - run: bun install --frozen-lockfile
      shell: bash
```

`--frozen-lockfile` fails if `bun.lock` is out of date — CI must build exactly
what a contributor committed.

## 2. Continuous integration (`ci.yml`)

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - name: Lint
        run: bun run lint
      - name: Typecheck & package checks
        run: bun run check # svelte-check / tsc / vue-tsc + publint per package
      - name: Test
        run: bun run test # unit + e2e across the workspace
      - name: Build
        run: bun run build # every package + the docs site
```

Notes:

- **`concurrency`** cancels superseded runs on the same ref, saving minutes.
- `bun run check` runs each package's `check` script (which includes `publint`),
  so a broken export map fails here, before release.
- Building the docs in CI catches SSR/prerender errors early.

> **Optional matrix.** To guard against Node/OS drift, wrap `quality` in a matrix
> over `os: [ubuntu-latest, windows-latest]` and `node: [20, 22]`. Keep the
> default single-job version for speed and add the matrix as a nightly schedule
> if minutes are a concern.

## 3. Publishing to npm with Changesets (`release.yml`)

Versioning is driven by **Changesets** (full rationale in
[11-conventions.md](11-conventions.md)). The flow:

1. Contributors add a changeset file describing each change.
2. On push to `main`, the workflow opens/updates a **"Version Packages" PR** that
   bumps versions and writes changelogs.
3. Merging that PR runs the workflow again, which now **publishes** to npm.

```yaml
name: Release

on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: release-main
  cancel-in-progress: false

permissions:
  contents: write # push the version PR and tags
  pull-requests: write # open/update the version PR
  id-token: write # npm provenance (OIDC)

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 } # Changesets needs full history
      - uses: ./.github/actions/setup

      - name: Build publishable packages
        run: bun run build:packages

      - name: Create Release PR or Publish
        uses: changesets/action@v1
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

Setup required once:

- **`NPM_TOKEN`** — a repository secret; an npm **automation** token for your
  scope with publish rights. Add via
  `gh secret set NPM_TOKEN --repo your-org/project-name`.
- **`NPM_CONFIG_PROVENANCE: true`** with `id-token: write` publishes with
  [npm provenance](https://docs.npmjs.com/generating-provenance-statements),
  linking each release to the exact workflow run that built it.
- The three framework libraries and the plugin are **versioned in lockstep** by
  configuring Changesets' `linked`/`fixed` group — see
  [11-conventions.md](11-conventions.md#4-changesets-configuration).

## 4. Deploying the docs to Cloudflare Workers (`docs-cloudflare.yml`)

Uses `@sveltejs/adapter-cloudflare` (selected via `DOCS_TARGET=cloudflare` from
[06-docs-site.md](06-docs-site.md#7-choosing-an-adapter-at-build-time)) and the
official Wrangler action.

```yaml
name: Docs → Cloudflare

on:
  push:
    branches: [main]
    paths: ['packages/**', '.github/workflows/docs-cloudflare.yml']
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - name: Build docs (Cloudflare adapter)
        run: bun run --filter '@scope/project-name-docs' build
        env: { DOCS_TARGET: cloudflare }
      - name: Deploy
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: packages/docs
          command: deploy
```

`packages/docs/wrangler.toml`:

```toml
name = "project-name-docs"
compatibility_date = "2024-11-01"
pages_build_output_dir = ".svelte-kit/cloudflare"
```

Secrets: `CLOUDFLARE_API_TOKEN` (with Workers edit permission) and
`CLOUDFLARE_ACCOUNT_ID`. Set them with `gh secret set`.

## 5. Deploying the docs to GitHub Pages (`docs-pages.yml`)

Uses `@sveltejs/adapter-static` (`DOCS_TARGET=static`). Pages serves from a
subpath (`/project-name/`), so pass `BASE_PATH`.

```yaml
name: Docs → GitHub Pages

on:
  push:
    branches: [main]
    paths: ['packages/**', '.github/workflows/docs-pages.yml']
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - name: Build docs (static adapter)
        run: bun run --filter '@scope/project-name-docs' build
        env:
          DOCS_TARGET: static
          BASE_PATH: /project-name # repo name; '' for a user/org root site
      - uses: actions/upload-pages-artifact@v3
        with: { path: packages/docs/build }

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

One-time repo setting: **Settings → Pages → Source = GitHub Actions**. For static
hosting, ensure the whole site prerenders (root `+layout.ts` exports
`prerender = true`), and that `adapter-static` has a `fallback` for any dynamic
routes.

> **Base path gotcha.** With a project Pages site, all internal links must respect
> `base`. In SvelteKit, import `{ base }` from `$app/paths` and prefix links, or
> rely on relative links. This is why `paths.base` is set only for the static
> build in [06-docs-site.md](06-docs-site.md#7-choosing-an-adapter-at-build-time).

## 6. Preview deployments for PRs (optional but recommended)

Add a `pull_request` trigger to the Cloudflare workflow and use
`command: versions upload` (or Wrangler preview) to publish an ephemeral URL per
PR, then comment it on the PR with `actions/github-script`. This gives reviewers a
live docs preview of every change before merge.

## 7. Required status checks

In **Settings → Branches → Branch protection for `main`**, require:

- `CI / quality` to pass.
- A PR (no direct pushes to `main`).
- Up-to-date branches before merge.

This guarantees nothing lands on `main` that would fail release or deploy.

## Checklist

- [ ] Composite setup action installs Bun + Node + deps with a frozen lockfile.
- [ ] `ci.yml`: lint, check (incl. `publint`), test, build on every PR.
- [ ] `release.yml`: Changesets version PR → npm publish with provenance.
- [ ] `docs-cloudflare.yml` and/or `docs-pages.yml` deploy the docs.
- [ ] Secrets set: `NPM_TOKEN`, and Cloudflare/Pages as applicable.
- [ ] Branch protection requires CI and PR review.

Next: [09-github-artifacts.md](09-github-artifacts.md).
