# 8. Conventions — commits, versions, changelogs

Conventional Commits for the history, SemVer for the numbers, Changesets for the
release notes. They are three separate things and it helps to keep them separate
in your head: commits describe _changes_, changesets describe _releases_.

Ten steps. Steps 1–2 are decisions you write down; 3–8 are configuration; 9–10
are verifying and using it.

---

## 1. Adopt Conventional Commits

The format:

```text
<type>(<scope>)<!>: <subject>

<body>

<footer>
```

### Types

| Type       | Use for                    | Release effect          |
| ---------- | -------------------------- | ----------------------- |
| `feat`     | a new capability           | minor                   |
| `fix`      | a bug fix                  | patch                   |
| `perf`     | faster, same behaviour     | patch                   |
| `refactor` | no behaviour change        | none                    |
| `docs`     | documentation only         | none                    |
| `test`     | tests only                 | none                    |
| `build`    | build system, dependencies | none                    |
| `ci`       | workflows                  | none                    |
| `chore`    | everything else            | none                    |
| `revert`   | reverts a previous commit  | matches what it reverts |

### Scopes

Use the package directory, or a subsystem within one:

```text
core, svelte, react, vue, docs, repo
core/build, core/themes, core/components
```

Decide the list now and put it in `commitlint.config.js` (step 5). An open-ended
scope list means `core`, `plugin` and `lunar` all appear in one history and none
of them can be filtered on.

### Breaking changes

Either a `!` before the colon, or a `BREAKING CHANGE:` footer. Both, for anything
significant:

```text
feat(core)!: replace `seed` with the `seeds` object

BREAKING CHANGE: `@plugin '.../theme' { seed: #0956aa }` is now
`seed-primary: #0956aa`. The bare status keys (`success`, `info`) are
`seed-success` and `seed-info`. Unknown options are now rejected with a
suggestion rather than ignored.
```

Write the footer for the person reading the changelog six months from now, not
for the reviewer who already knows what you did. Always say what to change _to_.

### Subject line rules

- imperative mood — "add", not "added" or "adds"
- no trailing period
- ≤ 72 characters
- lowercase after the colon, unless it starts with an identifier

---

## 2. Decide your versioning policy

| Change   | ≥ 1.0 | 0.x       |
| -------- | ----- | --------- |
| Breaking | major | **minor** |
| Feature  | minor | patch     |
| Fix      | patch | patch     |

Below 1.0, `minor` is the breaking bump. Changesets knows this; people do not,
which is why a changeset body should say "Breaking" in words even when the bump
is `minor`.

**Reach 1.0 when the plugin's option surface stops changing**, not when the
component list feels complete. Consumers care far more about `@plugin` options
being stable than about how many components exist.

### What counts as breaking here

Easy to underestimate:

- renaming or removing **any** CSS class the plugin emits
- renaming a `--theme-color-*` or shape token
- changing an `@plugin` option name, or rejecting one that used to be ignored
- changing a cascade layer's depth or name — it changes what overrides what
- narrowing a peer dependency range
- removing an `exports` subpath

Not breaking:

- adding a class, a token, or an option
- changing an internal build script
- anything inside `generated/`

Put this list in the repository's contributing guide verbatim. It is the single
most useful paragraph you can give a first-time contributor, and it is the thing
reviewers forget.

---

## 3. Install and configure Changesets

```powershell
bun add -D @changesets/cli @changesets/changelog-github
bunx changeset init
```

`init` writes a `.changeset/` directory with a default config. Replace it.

**`.changeset/config.json`** — replace the whole file:

```jsonc
{
	"$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
	"changelog": ["@changesets/changelog-github", { "repo": "acme/project-name" }],
	"commit": false,
	"fixed": [
		[
			"@scope/project-name",
			"@scope/project-name-svelte",
			"@scope/project-name-react",
			"@scope/project-name-vue"
		]
	],
	"linked": [],
	"access": "public",
	"baseBranch": "main",
	"updateInternalDependencies": "patch",
	"ignore": ["@scope/project-name-docs"]
}
```

Two choices worth understanding:

**`fixed` versus `linked`.** `fixed` keeps all four packages on the _same_ number
always — a release of one releases all. `linked` only aligns them when they
happen to release together. `fixed` is simpler to reason about and to document
("install v2 of everything"); the cost is version churn on packages that did not
change.

**`changelog-github`** turns each entry into a line with the PR and author
linked. Worth the extra dependency. It needs a `GITHUB_TOKEN` in the environment
when `changeset version` runs, which the release workflow in
[guide 9](09-github.md) provides.

`ignore` keeps the docs site out of versioning entirely — it is private and never
published, and without this Changesets asks about it on every `bun changeset`.

Check the config parses before moving on:

```powershell
bunx changeset status
```

---

## 4. Learn to write one

```powershell
bun changeset
```

It asks which packages changed, then which bump each takes, then opens an editor.
Write the entry as **release notes, not a commit message** — the reader has not
seen your diff:

```md
---
'@scope/project-name': minor
---

Per-role seeds. A theme can now pin any palette to an exact colour instead of
deriving everything from one seed:

    @plugin '@scope/project-name/theme' {
    	name: brand;
    	seed-primary: #0956aa;
    	seed-secondary: #52e2ac;
    }

Anything you leave out stays derived from `seed-primary`, so the palette still
hangs together. Core seeds are used exactly; status seeds are still harmonized
toward the primary unless you set `harmonize: false`.
```

One changeset per user-visible change, not per commit and not per PR. A PR that
fixes two unrelated bugs gets two, so the changelog has two entries.

**Enforce that every PR has one.** [Guide 9](09-github.md) has the workflow. The
escape hatch is an empty changeset for PRs that genuinely ship nothing:

```powershell
bun changeset --empty
```

---

## 5. Install commitlint and husky

```powershell
bun add -D @commitlint/cli @commitlint/config-conventional husky
bunx husky init
```

`husky init` creates `.husky/` and adds a `prepare` script to the root
`package.json`, so hooks install themselves on every fresh clone.

**`commitlint.config.js`** — new file, at the repository root beside
`eslint.config.js`.

```js
export default {
	extends: ['@commitlint/config-conventional'],
	rules: {
		'scope-enum': [2, 'always', ['core', 'svelte', 'react', 'vue', 'docs', 'repo', 'deps']],
		'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
		'header-max-length': [2, 'always', 72],
		'body-max-line-length': [2, 'always', 100]
	}
};
```

`.husky/commit-msg` — a hook **body**, not a command you type. Git for Windows
runs hooks under its own bundled `sh`, so this file is POSIX shell on every
platform:

```sh
bunx commitlint --edit "$1"
```

Test it immediately, both ways:

```powershell
git commit --allow-empty -m "bad message"          # must be rejected
git commit --allow-empty -m "chore(repo): wire up commitlint"   # must pass
```

---

## 6. Add a fast pre-commit hook

`.husky/pre-commit` — keep it _fast_, under a second or two, or people will use
`--no-verify` and you have gained nothing:

```sh
bunx lint-staged
```

**`.lintstagedrc.json`** — new file, at the repository root.

```json
{
	"*.{ts,js,svelte,vue,css,json,md}": "prettier --write",
	"*.{ts,svelte,vue}": "eslint --fix"
}
```

`lint-staged` runs against staged files only, which is what keeps it fast. Do not
be tempted to add `tsc --noEmit` or the test suite here — those belong in CI,
where they can take a minute without anyone waiting on them.

Note that **hooks do not run in CI**, and CI is the thing that actually gates
merges. Guide 9 runs commitlint there too. The hook is a courtesy that catches
mistakes early; the workflow is the rule.

---

## 7. Configure VS Code

VS Code cannot validate a commit message on its own, but three extensions between
them get you most of the way.

**`.vscode/extensions.json`** — new file. Everyone is prompted on clone:

```jsonc
{
	"recommendations": [
		"vivaxy.vscode-conventional-commits", // guided commit builder in the SCM panel
		"esbenp.prettier-vscode",
		"dbaeumer.vscode-eslint",
		"svelte.svelte-vscode",
		"Vue.volar",
		"bradlc.vscode-tailwindcss",
		"ms-vscode.vscode-typescript-next"
	]
}
```

**`.vscode/settings.json`** — new file. [Guide 11](11-debugging.md) adds
`launch.json` and `tasks.json` to the same directory.

```jsonc
{
	// Conventional Commits extension
	"conventionalCommits.scopes": ["core", "svelte", "react", "vue", "docs", "repo", "deps"],
	"conventionalCommits.autoCommit": false,
	"conventionalCommits.showEditor": true,

	// Native git input validation — the ruler turns red past 72 characters
	"git.inputValidation": true,
	"git.inputValidationLength": 72,
	"git.inputValidationSubjectLength": 72,

	// Formatting
	"editor.formatOnSave": true,
	"editor.defaultFormatter": "esbenp.prettier-vscode",
	"editor.codeActionsOnSave": { "source.fixAll.eslint": "explicit" },

	// Tailwind IntelliSense inside cn()/clsx()/cva()
	"tailwindCSS.experimental.classRegex": [
		["cn\\(([^)]*)\\)", "[\"'`]([^\"'`]*)[\"'`]"],
		["cva\\(([^)]*)\\)", "[\"'`]([^\"'`]*)[\"'`]"]
	],
	"tailwindCSS.classAttributes": ["class", "className", "ngClass", "class:list"],

	// The design system is authored in CSS; treat those files as Tailwind
	"files.associations": { "*.css": "tailwindcss" },

	// Don't let the editor's TS server fight the repo's version
	"typescript.tsdk": "node_modules/typescript/lib",
	"typescript.enablePromptUseWorkspaceTsdk": true
}
```

Keep the `conventionalCommits.scopes` array and `commitlint`'s `scope-enum` in
sync by hand — nothing checks them against each other, and a scope the extension
offers but commitlint rejects is a specifically annoying way to fail.

Write this file with an editor, not a shell heredoc: the `classRegex` values are
full of backslashes and most shells will eat them, leaving you with invalid JSON
that VS Code ignores silently.

---

## 8. Add a commit-message template

**`.gitmessage`** — new file, at the repository root.

```text
# <type>(<scope>): <subject>          ≤72 chars, imperative, no full stop
#
# <body>                              what and why, not how
#
# BREAKING CHANGE: <what changed, and what to change it to>
# Refs: #<issue>
#
# types:  feat fix perf refactor docs test build ci chore revert
# scopes: core svelte react vue docs repo deps
```

```powershell
git config commit.template .gitmessage
```

`git config` is per-clone, not committed, so put that line in the contributing
guide or in a `setup` script — otherwise you are the only person who has it.

---

## 9. Verify the chain end to end

On a scratch branch:

```powershell
git commit --allow-empty -m "feat(core): add a thing"   # hook passes
bun changeset                                            # write one, pick minor
bunx changeset status --since=main                       # lists the pending bump
bunx changeset version --dry-run                         # shows the numbers
git clean -fd                                            # remove dry-run leftovers
```

`changeset version --dry-run` is the step people skip and should not. It tells
you what the release workflow will do, before a release is on the line — and it
is where you catch the peer-dependency majoring trap below.

---

## 10. Release

The mechanics are in [guide 9](09-github.md) and the operational detail is in
[guide 13](13-release.md); the _judgement_ is here.

1. Merge PRs, each carrying a changeset.
2. The release workflow opens a "Version Packages" PR that consumes every pending
   changeset, bumps versions and writes `CHANGELOG.md`.
3. **Read that PR.** It is the last point at which you can fix a bump that is
   wrong or a changelog entry that will confuse people.
4. Merge it. The same workflow publishes to npm and tags the release.

---

## Files after this phase

Eight files, all at the repository root. None of them ship; all of them change
how the repository is worked in.

| File                      | Status   | Written in | Next touched by                      |
| ------------------------- | -------- | ---------- | ------------------------------------ |
| `.changeset/config.json`  | replaced | step 3     | [9](09-github.md) — release workflow |
| `.changeset/README.md`    | kept     | `init`     | never                                |
| `commitlint.config.js`    | added    | step 5     | when scopes change                   |
| `.husky/commit-msg`       | added    | step 5     | never                                |
| `.husky/pre-commit`       | added    | step 6     | never                                |
| `.lintstagedrc.json`      | added    | step 6     | never                                |
| `.vscode/extensions.json` | added    | step 7     | never                                |
| `.vscode/settings.json`   | added    | step 7     | [11](11-debugging.md) — same folder  |
| `.gitmessage`             | added    | step 8     | when scopes change                   |
| `package.json`            | modified | step 5     | never                                |

`husky init` also adds a `prepare` script to the root `package.json`, so hooks
install themselves on every fresh clone. That is the only change to it here.

---

### `package.json` — the one added line

```json
"scripts": {
	"prepare": "husky"
}
```

Written by `husky init`. It runs after `bun install`, which is what makes the
hooks work for anyone who clones the repository rather than only for you.

---

### `.changeset/config.json`

```jsonc
{
	"$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",

	// Each entry becomes a changelog line with the PR and author linked. Needs
	// GITHUB_TOKEN in the environment when `changeset version` runs, which the
	// release workflow in guide 9 provides.
	"changelog": ["@changesets/changelog-github", { "repo": "acme/project-name" }],

	// The release workflow commits; Changesets should not do it too.
	"commit": false,

	/*
		`fixed` keeps all four packages on the SAME number always — a release of
		one releases all. The alternative, `linked`, aligns them only when they
		happen to release together.

		Take `fixed`: it is simpler to reason about and to document ("install v2
		of everything"). The cost is version churn on packages that did not
		change, which is cheap.
	*/
	"fixed": [
		[
			"@scope/project-name",
			"@scope/project-name-svelte",
			"@scope/project-name-react",
			"@scope/project-name-vue"
		]
	],
	"linked": [],

	"access": "public",
	"baseBranch": "main",

	// When one package in the group bumps, dependents get a patch rather than
	// inheriting the same bump.
	"updateInternalDependencies": "patch",

	// The docs site is private and never published. Without this, Changesets
	// asks about it on every `bun changeset`.
	"ignore": ["@scope/project-name-docs"]
}
```

`changeset init` also writes `.changeset/README.md`. Leave it — it explains the
`.changeset` directory to anyone who opens it expecting source.

---

### `commitlint.config.js`

```js
export default {
	extends: ['@commitlint/config-conventional'],
	rules: {
		/*
			A closed scope list. Open-ended scopes mean `core`, `plugin` and
			`lunar` all appear in one history and none of them can be filtered on.

			Keep this in sync BY HAND with `conventionalCommits.scopes` in
			.vscode/settings.json — nothing checks them against each other, and a
			scope the editor offers but commitlint rejects is a specifically
			annoying way to fail.
		*/
		'scope-enum': [2, 'always', ['core', 'svelte', 'react', 'vue', 'docs', 'repo', 'deps']],

		// Subjects are lower case unless they start with an identifier.
		'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],

		'header-max-length': [2, 'always', 72],
		'body-max-line-length': [2, 'always', 100]
	}
};
```

---

### `.husky/commit-msg`

A hook **body**, not a command you type. Git for Windows runs hooks under its
own bundled `sh`, so this file is POSIX shell on every platform.

```sh
bunx commitlint --edit "$1"
```

`$1` is the path to the file holding the message git is about to use.

---

### `.husky/pre-commit`

```sh
bunx lint-staged
```

Keep it to this. Anything slower than a second or two gets `--no-verify`'d, and
then it is not a gate at all. `tsc --noEmit` and the test suite belong in CI,
where they can take a minute without anyone waiting.

---

### `.lintstagedrc.json`

```json
{
	"*.{ts,js,svelte,vue,css,json,md}": "prettier --write",
	"*.{ts,svelte,vue}": "eslint --fix"
}
```

Staged files only, which is what keeps it fast. Both commands rewrite files, and
`lint-staged` re-stages what they changed — so a formatting fix lands in the
same commit rather than as a follow-up.

---

### `.vscode/extensions.json`

```jsonc
{
	"recommendations": [
		// Guided commit builder in the SCM panel, matching the scopes above.
		"vivaxy.vscode-conventional-commits",
		"esbenp.prettier-vscode",
		"dbaeumer.vscode-eslint",
		"svelte.svelte-vscode",
		"Vue.volar",
		"bradlc.vscode-tailwindcss"
	]
}
```

VS Code prompts for these on clone, which is the point — a contributor gets the
right tooling without being told about it.

---

### `.vscode/settings.json`

Write this one with an editor, not a shell heredoc: the `classRegex` values are
full of backslashes and most shells will eat them, leaving invalid JSON that
VS Code ignores silently.

```jsonc
{
	// Conventional Commits extension. Keep in sync with commitlint's scope-enum.
	"conventionalCommits.scopes": ["core", "svelte", "react", "vue", "docs", "repo", "deps"],
	"conventionalCommits.autoCommit": false,
	"conventionalCommits.showEditor": true,

	// Native git input validation — the ruler turns red past 72 characters.
	"git.inputValidation": true,
	"git.inputValidationLength": 72,
	"git.inputValidationSubjectLength": 72,

	"editor.formatOnSave": true,
	"editor.defaultFormatter": "esbenp.prettier-vscode",
	"editor.codeActionsOnSave": { "source.fixAll.eslint": "explicit" },

	/*
		Tailwind IntelliSense inside cn()/clsx()/cva(). Without these, class
		completion works in `class` attributes and stops working the moment you
		wrap them in a helper — which is everywhere in this repository.
	*/
	"tailwindCSS.experimental.classRegex": [
		["cn\\(([^)]*)\\)", "[\"'`]([^\"'`]*)[\"'`]"],
		["cva\\(([^)]*)\\)", "[\"'`]([^\"'`]*)[\"'`]"]
	],
	"tailwindCSS.classAttributes": ["class", "className", "ngClass", "class:list"],

	// The design system is authored in CSS; treat those files as Tailwind so
	// @plugin, @utility and @theme are not reported as unknown at-rules.
	"files.associations": { "*.css": "tailwindcss" },

	// Do not let the editor's bundled TypeScript fight the repo's version.
	"typescript.tsdk": "node_modules/typescript/lib",
	"typescript.enablePromptUseWorkspaceTsdk": true
}
```

---

### `.gitmessage`

```text
# <type>(<scope>): <subject>          ≤72 chars, imperative, no full stop
#
# <body>                              what and why, not how
#
# BREAKING CHANGE: <what changed, and what to change it to>
# Refs: #<issue>
#
# types:  feat fix perf refactor docs test build ci chore revert
# scopes: core svelte react vue docs repo deps
```

Every line is a comment, so an unedited template produces an empty message and
git aborts — which is the behaviour you want.

Wiring it up is per-clone and not committed:

```powershell
git config commit.template .gitmessage
```

Put that line in `CONTRIBUTING.md` or a setup script, or you will be the only
person who has it.

---

## Traps

> **Changesets majors any package with a peer dependency on a bumped package** —
> regardless of whether the range is actually violated. With `fixed` groups and
> peer-linked bindings, one patch to the plugin proposes a major for all three
> framework packages.
>
> **How to tell:** the Version Packages PR proposes `1.0.0` when you expected
> `0.3.1`.
>
> **Fix:** `___experimentalUnsafeOptions_WILL_CHANGE_IN_PATCH.onlyUpdatePeerDependentsWhenOutOfRange: true`,
> plus a peer range wide enough to survive the bump. Verify with
> `bunx changeset version --dry-run` — this is not something to discover at
> publish time.

> **`changeset version` leaves untracked `CHANGELOG.md` files behind after a dry
> run.** `git checkout` does not remove untracked files, so they linger and get
> committed by accident.
>
> **Fix:** `git clean -fd` after any dry run, or run it in a worktree.

> **Someone force-pushes over a published tag.** npm will not let you republish a
> version, so the tag and the registry disagree forever.
>
> **Fix:** protect tags in repository settings. Recovery is `npm deprecate` plus
> a new patch — never `npm unpublish`.

> **`scope-enum` and the VS Code scope list drift apart.** The extension offers a
> scope commitlint rejects, so the guided builder produces a commit the hook
> refuses. Reads like the hook is broken.
>
> **Fix:** treat the two lists as one setting; change them in the same commit.

---

## Commit

Verify, then commit:

```powershell
bunx changeset status
git add -A
git commit -m "chore(repo): add Conventional Commits, Changesets and hooks"
```

**This is the commit that changes how you commit.** From here the `commit-msg`
hook rejects anything that is not a Conventional Commit, so the message above
is the first one that has to pass its own check. If the hook rejects it,
`commitlint.config.js` and the message disagree — fix the config, not the
message.

From the next commit onward, anything that changes what a consumer receives
also needs a changeset. This one does not: it touches only repository
tooling.
---

Next: [GitHub](09-github.md)
