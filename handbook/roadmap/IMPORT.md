# Importing the Roadmap into GitHub

This folder holds the machine-readable roadmap and an importer. Two paths are
documented: the **script** (recommended) and **manual `gh` commands**.

## Files

| File                                 | What it is                                             |
| ------------------------------------ | ------------------------------------------------------ |
| [milestones.json](milestones.json)   | Milestones with titles, states, and descriptions.      |
| [issues.json](issues.json)           | Labels and issues (each mapped to a milestone).         |
| [import.ts](import.ts)               | Bun script that creates labels → milestones → issues.  |

## Prerequisites

- **GitHub CLI** (`gh`) — https://cli.github.com
- Authenticate once with a token that has `repo` scope:

  ```sh
  gh auth login
  ```

- A **target repository** that already exists on GitHub. Create one if needed:

  ```sh
  gh repo create your-org/project-name --public --source . --remote origin --push
  ```

## Option A — the importer script (recommended)

```sh
export GH_REPO=your-org/project-name        # POSIX shells
# $env:GH_REPO = 'your-org/project-name'    # PowerShell

# Preview without writing anything:
bun handbook/roadmap/import.ts --dry-run

# Create labels, milestones, and issues for real:
bun handbook/roadmap/import.ts
```

What it does, in order:

1. Creates each label (idempotent: `--force` updates an existing one).
2. Creates each milestone, reusing existing ones by title (so re-runs do not
   duplicate milestones), and records their numbers.
3. Creates each issue with its labels and assigns it to its milestone by title.

> **Safety.** Issues are **not** de-duplicated — run the importer against a fresh
> repository. Labels and milestones are safe to re-run. There is a `--dry-run`
> flag; use it first.

## Option B — manual `gh` commands

For full control, or to import selectively.

### 1. Labels

```sh
gh label create 'area:plugin' --repo "$GH_REPO" --color 1d76db --description 'Tailwind plugin package'
gh label create 'type:feat'   --repo "$GH_REPO" --color 0e8a16 --description 'New feature'
# … repeat for the rest in issues.json
```

### 2. Milestones

`gh` has no first-class milestone command, so use the REST API:

```sh
gh api -X POST repos/$GH_REPO/milestones \
  -f title='v0.1.0 — Foundation' \
  -f state=open \
  -f description='Monorepo foundation and the plugin core token layer.'
```

List them to find numbers if you need them:

```sh
gh api repos/$GH_REPO/milestones
```

### 3. Issues

```sh
gh issue create --repo "$GH_REPO" \
  --title 'Initialize Bun workspace and shared tooling' \
  --body 'See handbook/01-monorepo-setup.md' \
  --label 'area:build,type:chore,p0' \
  --milestone 'v0.1.0 — Foundation'
```

## Regenerating or extending the roadmap

- Edit [milestones.json](milestones.json) / [issues.json](issues.json) and re-run
  the importer against a fresh repo, **or** add the new items by hand with Option
  B so you do not duplicate existing issues.
- Keep the human-readable narrative in
  [../07-issues-milestones.md](../07-issues-milestones.md) in sync — it is the
  source of truth contributors read first.

## Alternative importers

If you prefer not to use the bundled script, these community tools consume
similar JSON/CSV and are worth knowing about:

- `gh` extensions such as `gh-milestone` for milestone management.
- CSV import via the GitHub web UI is **not** supported natively; the REST API
  (as above) is the supported programmatic path.
