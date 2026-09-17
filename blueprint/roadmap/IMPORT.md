# Importing the roadmap into GitHub

[`milestones.json`](milestones.json) and [`issues.json`](issues.json) are the
canonical data. [`README.md`](README.md) is generated from them and is the
human-readable view.

---

## Prerequisites

```sh
gh --version          # ≥ 2.40
gh auth login         # needs the `repo` scope
gh auth status
```

The repository must already exist and you need write access:

```sh
gh repo create acme/project-name --public --source=. --remote=origin --push
```

---

## The one command

```sh
# See exactly what would happen. Nothing is written.
bun blueprint/roadmap/import.ts --repo acme/project-name --dry-run

# Do it.
bun blueprint/roadmap/import.ts --repo acme/project-name
```

Order matters and the script handles it: **labels first, then milestones, then
issues**, because an issue cannot reference a label or milestone that does not
exist yet.

It is **idempotent**. Milestones and labels are matched by name; an issue with an
identical title is not created twice. Add to the JSON and re-run to import only
what is new.

Expect roughly a minute for 50 issues — `gh` is rate-limited and the script does
not parallelise, deliberately, because a 403 halfway through a parallel run is
far messier to recover from.

---

## Doing it by hand

If you would rather not run the script, the same three steps:

```sh
REPO=acme/project-name

# 1. Labels
gh label create 'area:core'  --repo "$REPO" --color 1d76db --description 'The Tailwind plugin'
gh label create 'type:feat'  --repo "$REPO" --color a2eeef --description 'New capability'
# … see LABEL_STYLE in import.ts for the full set

# 2. Milestones — gh has no milestone command, so use the API
gh api "repos/$REPO/milestones" \
  -f title='v0.2.0 — Plugin core' \
  -f description='CSS compiles to a working Tailwind plugin…' \
  -f state=open

# 3. Issues
gh issue create --repo "$REPO" \
  --title 'Build: compile CSS and partition into per-component bundles' \
  --body-file /tmp/body.md \
  --milestone 'v0.2.0 — Plugin core' \
  --label 'area:core' --label 'type:feat' --label 'priority:high'
```

Use `--body-file` rather than `--body` for anything with newlines or backticks.
Shell quoting will otherwise mangle fenced code blocks, and you will not notice
until the issue renders.

---

## After importing

**Create a project board.**

```sh
gh project create --owner acme --title 'project-name roadmap'
```

Then link it to the repository and add a workflow so new issues land in it
automatically. Projects v2 is not fully scriptable — the auto-add workflow is
configured in the web UI, under the project's **Workflows** tab.

**Pin the milestone order.** GitHub sorts milestones by due date, not by name. If
you want them in version order, set due dates in ascending order — they do not
have to be realistic, and nothing enforces them.

**Set the default milestone** for new issues via the issue templates, so triage
is a smaller job.

---

## Keeping the files and GitHub in sync

They will drift. That is fine — GitHub becomes the source of truth the moment
work starts, and these files are the seed.

Two habits keep them useful:

- **Re-export before major planning.** Pull the current state back into JSON so
  the offline copy is current:

  ```sh
  gh issue list --repo acme/project-name --state all --limit 500 \
    --json title,body,labels,milestone > roadmap/exported.json
  ```

- **Regenerate the readable view** after editing the JSON:

  ```sh
  bun blueprint/roadmap/render.ts
  ```

  `render.ts` fails if `issues.json` references a milestone that
  `milestones.json` does not define, which catches the most common editing
  mistake.

---

## Troubleshooting

| Symptom                              | Cause                                                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `could not add label: 'x' not found` | Labels were not created first. Re-run; the script does them in order.                               |
| `milestone 'x' not found`            | The milestone title in `issues.json` does not exactly match `milestones.json`. The em dash matters. |
| `HTTP 403` partway through           | Secondary rate limit. Wait a minute and re-run — already-created issues are skipped.                |
| Issue bodies render as one paragraph | You used `--body` with a multi-line string. Use `--body-file`.                                      |
| Duplicate issues after re-running    | A title was edited on GitHub. Matching is by exact title.                                           |
