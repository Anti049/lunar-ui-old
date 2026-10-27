# 8. Conventions — commits, versions, changelogs

Conventional Commits for the history, SemVer for the numbers, Changesets for the
release notes. They are three separate things and it helps to keep them separate
in your head: commits describe _changes_, changesets describe _releases_.

Ten steps. Steps 1–2 are decisions you write down; 3–8 are configuration; 9–10
are verifying and using it.

---

## 1. Adopt Conventional Commits

### What it is

A grammar for the first line of a commit message:

```text
<type>(<scope>)<!>: <subject>

<body>

<footer>
```

Everything except `<type>` and `<subject>` is optional. `feat: add a badge` is
valid; so is the fully-loaded form with a scope, a breaking marker and a footer.

### What it actually buys you

Be clear-eyed about this, because the honest answer is narrower than the
advocacy suggests.

**The history becomes queryable.** This is the real benefit and it compounds.
Six months in, questions you cannot otherwise answer become one command:

```powershell
# Everything that touched the plugin since the last tag.
git log v1.4.0..HEAD --oneline --grep '^[a-z]*(core)'

# Every breaking change, ever.
git log --grep 'BREAKING CHANGE' --grep '!:' --all-match --oneline

# What shipped to React consumers this quarter.
git log --since='3 months ago' --oneline --grep '(react)'
```

**It forces one decision per commit.** Writing `feat(core)` means noticing that
you also touched the Svelte package, which usually means the commit should have
been two. That pressure is most of the value and it happens before the commit
exists.

**It gives reviewers the shape of a change before they read the diff.**
`refactor(core/build)` and `fix(svelte)` invite completely different reading.

**It is a shared vocabulary that survives you.** Contributors who have used it
elsewhere need no onboarding, and the ones who have not learn it from the hook.

### What it costs

**The types are a lie at the margins.** Is a dependency bump that fixes a bug
`fix` or `build`? Is deleting dead code `refactor` or `chore`? These questions
have no correct answer, and time spent on them is wasted. Pick one, write it in
`CONTRIBUTING.md`, and stop thinking about it. The convention is worth having
because it is consistent, not because it is right.

**It does not write your changelog.** This is the most common misconception.
Commit subjects are written for reviewers who have the diff in front of them;
changelog entries are written for consumers who do not. `fix(core): handle
undefined` is a fine commit and a useless changelog line. That gap is exactly
why [step 3](#3-install-and-configure-changesets) adds Changesets rather than
generating notes from the history.

**It adds friction to every commit**, including the trivial ones. The hook in
step 5 rejects `wip`, and sometimes `wip` is what you meant. `git commit
--no-verify` exists; using it occasionally is fine and does not make the
convention worthless.

**Squash-merging can erase it.** If GitHub's squash button composes a subject
from the PR title, every commit in the repository ends up shaped by whatever
people type into a web form. [Guide 9](09-github.md) step 9 sets the default
squash message to the PR title for that reason — so at least the PR title is
linted in CI.

### What you are choosing instead of

| Alternative              | Why not here                                                                                                                                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No convention            | Perfectly viable for a solo project that never releases. The moment you need "what changed for React consumers", it is too late.                                                                                                             |
| `semantic-release`       | Derives versions from commit types automatically. Powerful, and wrong for a design system: the commit that renames a CSS class looks like a `feat`, and only a human knows it is breaking. Changesets keeps that judgement where it belongs. |
| Gitmoji                  | Same idea, emoji instead of words. Harder to grep, harder to type, and `scope-enum` has no equivalent.                                                                                                                                       |
| Free-text + good reviews | Works while the team is small and everyone remembers. Does not survive a contributor who has not read the last two years of history.                                                                                                         |

**Take Conventional Commits, and do not take `semantic-release` with it.** The
combination looks efficient and quietly removes the one decision — is this
breaking? — that you most want a person to make.

### The types, in full

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

"Release effect" is what a **reader** should infer, not what any tool does.
Nothing in this setup reads commit types to decide a version — changesets do
that, and a `feat` commit with no changeset releases nothing.

Two worth calling out because they are routinely misused:

- **`chore` is not a dumping ground.** If it changed what a consumer receives,
  it is not a chore. A `chore` commit that needs a changeset is a mistyped
  `feat` or `fix`.
- **`refactor` means the output is identical.** For this repository that is
  testable: the parity harness in [guide 12](12-testing.md) will tell you
  whether a `refactor(core)` really was one.

### Scopes

Use the package directory, or a subsystem within one:

```text
core, svelte, react, vue, docs, repo
core/build, core/themes, core/components
```

Decide the list now and put it in `commitlint.config.js` (step 5). An open-ended
scope list means `core`, `plugin` and `lunar` all appear in one history and none
of them can be filtered on.

`repo` is the escape hatch for anything that is not a package — CI, the root
config, the blueprint itself. `deps` is for dependency bumps, and exists mainly
so Dependabot's commits do not all land in `chore` with no scope.

### Breaking changes

Either a `!` before the colon, or a `BREAKING CHANGE:` footer. Both, for
anything significant:

```text
feat(core)!: replace `seed` with the `seeds` object

BREAKING CHANGE: `@plugin '.../theme' { seed: #0956aa }` is now
`seed-primary: #0956aa`. The bare status keys (`success`, `info`) are
`seed-success` and `seed-info`. Unknown options are now rejected with a
suggestion rather than ignored.
```

The `!` is for scanning; the footer is for the person who has hit the break and
needs to know what to do. Write the footer for someone reading the changelog six
months from now, not for the reviewer who already knows what you did, and
**always say what to change it to**.

For this project specifically, the CSS class names and tokens are public API —
[step 2](#2-decide-your-versioning-policy) has the list of what that makes
breaking. It is longer than people expect.

### Subject line rules

- imperative mood — "add", not "added" or "adds". The test: the subject should
  complete the sentence "if applied, this commit will …".
- no trailing period
- ≤ 72 characters, so `git log --oneline` stays one line in a terminal
- lowercase after the colon, unless it starts with an identifier
  (`fix(core): --radius-button now falls back correctly`)

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
bun add -D '@changesets/cli' '@changesets/changelog-github'
bunx changeset init
```

### `init` is interactive, and asks three questions

Changesets 3.x prompts rather than writing a default file. Answer them like
this:

```text
◇  Should the GitHub integration be used for changelogs?
Yes
◇  What is the GitHub repository? (e.g. org/repo)
Anti049/test
◇  Should changeset files and version bumps be automatically committed?
No
```

| Prompt                             | Answer         | What it sets                                                                                                                                               |
| ---------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub integration for changelogs? | **Yes**        | `"changelog": ["@changesets/changelog-github", { "repo": … }]`. This is the npm package, not the bot — see below.                                          |
| Which repository?                  | `Anti049/test` | `owner/repo` only. Not a URL, no `.git` suffix. Wrong here and the changelog links 404, silently, for every release.                                       |
| Auto-commit?                       | **No**         | `"commit": false`. The release workflow makes the commit; `true` makes the CLI commit as you write each changeset, which fights any rebase-based workflow. |

Cancelling at any prompt writes nothing — re-run it. And note that `init` asks
about **two** of the eight options that matter; the rest are added by hand
below, and `fixed` in particular is the one that actually shapes your releases.

### "The GitHub integration" is three separate things

They are routinely confused, and you want two of the three.

| Thing                          | What it is                                                                  | Take it?                                          |
| ------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------- |
| `@changesets/changelog-github` | An npm package. Formats changelog entries with the PR and author linked.    | **Yes**                                           |
| `changesets/action`            | A GitHub Action. Opens the Version PR and publishes.                        | **Yes** — [guide 9](09-github.md) already uses it |
| The Changeset bot              | A third-party GitHub **App**, installed on the repository. Comments on PRs. | **Only if you take outside contributions**        |

#### `@changesets/changelog-github` — take it

The default changelog generator writes the entry text and nothing else.
`changelog-github` adds the PR number, a link to it, and the author's handle:

```md
## 2.1.0

### Minor Changes

- [#142](https://github.com/Anti049/test/pull/142)
  [`a1b2c3d`](https://github.com/Anti049/test/commit/a1b2c3d)
  Thanks [@someone](https://github.com/someone)! - Per-role seeds…
```

Worth the extra dependency: when someone reports a regression against 2.1.0, the
changelog takes you to the PR in one click rather than to a commit you then have
to trace.

**It needs a `GITHUB_TOKEN` when `changeset version` runs.** In CI the release
workflow provides it. Locally, `changeset version` without one fails with a
GitHub API error that says nothing about tokens. There is no dry-run flag, and
`version` consumes the changesets and rewrites every manifest it bumps — so to
preview the changelog, run it in a throwaway worktree:

```powershell
$env:GITHUB_TOKEN = (gh auth token)
git worktree add "$env:TEMP\changeset-preview" HEAD
Push-Location "$env:TEMP\changeset-preview"
bun install; bunx changeset version; git diff
Pop-Location
git worktree remove --force "$env:TEMP\changeset-preview"
Remove-Item Env:GITHUB_TOKEN
```

For the version **numbers** alone, `bunx changeset status --verbose` is enough:
it prints the release plan, writes nothing, and needs no token.

#### The Changeset bot — probably not, yet

[`github.com/apps/changeset-bot`](https://github.com/apps/changeset-bot) is a
GitHub App that comments on every PR saying whether a changeset is present, with
an "Add a changeset" link that opens the GitHub editor pre-filled.

**For:** a first-time contributor can add a changeset from the browser without
cloning, and the comment updates itself when they do. That is genuinely nice on
a repository with drive-by contributions.

**Against:** it is a third-party App with write access to your repository's pull
requests, and [guide 9](09-github.md) step 5 already enforces the same rule as a
required check that cannot be bypassed. The bot **advises**; the workflow
**gates**. Running both is fine and mildly redundant; running only the bot means
a PR can merge without a changeset.

**Take the workflow. Add the bot later if and when outside PRs start arriving.**
Do not replace the workflow with it.

### The configuration, option by option

**`.changeset/config.json`** — `init` wrote the first three lines; add the rest.
This is the whole file:

```jsonc
{
	"$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
	"changelog": ["@changesets/changelog-github", { "repo": "Anti049/test" }],
	"commit": false,
	"fixed": [["@anti049/test", "@anti049/test-svelte", "@anti049/test-react", "@anti049/test-vue"]],
	"linked": [],
	"access": "public",
	"baseBranch": "main",
	"updateInternalDependencies": "patch",
	"ignore": ["@anti049/test-docs"]
}
```

| Option                       | Value here                  | Why, and what the alternative costs                                                                                                                                                   |
| ---------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `changelog`                  | `changelog-github`          | See above. `"@changesets/cli/changelog"` is the dependency-free default and produces entries with no links; `false` disables changelogs entirely.                                     |
| `commit`                     | `false`                     | The release workflow makes the commit. `true` makes the CLI commit as you write each changeset, which fights any rebase-based workflow.                                               |
| `fixed`                      | the four published packages | See below.                                                                                                                                                                            |
| `linked`                     | `[]`                        | Mutually exclusive with `fixed` for the same packages. See below.                                                                                                                     |
| `access`                     | `"public"`                  | Scoped packages default to restricted, and a restricted publish on a free account simply fails. `publishConfig.access` in each manifest says the same thing; both is belt and braces. |
| `baseBranch`                 | `"main"`                    | What `changeset status` diffs against. Wrong here and the changeset check passes when it should fail.                                                                                 |
| `updateInternalDependencies` | `"patch"`                   | When one package in the group bumps, dependents get a patch. `"minor"` is the alternative and inflates every release.                                                                 |
| `ignore`                     | the docs site               | It is private and never published. Without this, Changesets asks about it on every `bun changeset` and can propose versioning it.                                                     |

#### `fixed` versus `linked` — the one real decision

Both keep a group of packages' versions related. They differ in what happens to
a package that did not change.

**`fixed`** — the whole group moves together, always. Change only the plugin,
and all four publish at the new number.

- _For:_ one number to document and to support. "Install v2 of everything" is a
  sentence you can put in a README, and a bug report that says "2.1.0" is
  unambiguous. Peer ranges between your own packages stay trivially satisfiable.
- _Against:_ churn. `@anti049/test-vue` publishes releases containing no change,
  and its changelog fills with "Updated dependencies" entries.

**`linked`** — versions align only when packages happen to release together, and
drift otherwise.

- _For:_ no empty releases. A package's version reflects its own history.
- _Against:_ four numbers to reason about. "Which version of the Vue package
  works with plugin 2.3?" becomes a question with a real answer you have to look
  up, and a compatibility matrix in the README that has to be maintained.

**Take `fixed` for a design system.** The packages are useless apart — the
bindings are thin wrappers over the plugin and have no independent life — so
tying them together costs only registry noise, and buys a support story that
fits in one line. Take `linked` when packages genuinely can be used separately.

Either way, `ignore` the docs site: it must not appear in either list.

#### One option deliberately absent

`privatePackages` is not set, which leaves the default `{ version: true, tag: true }`. It does not matter here because the only private package is
`ignore`d. If you later add a private package you _do_ want versioned — an
internal tooling package, say — remove it from `ignore` rather than touching
this.

### Check it parses

```powershell
bunx changeset status
```

Expect "There are no changesets" and exit code 0. An error here is a malformed
config, and it is much easier to fix now than during a release.

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
'@anti049/test': minor
---

Per-role seeds. A theme can now pin any palette to an exact colour instead of
deriving everything from one seed:

    @plugin '@anti049/test/theme' {
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
bunx changeset status --since=main --verbose             # the release plan, with new versions
```

`status --verbose` is the step people skip and should not. It prints the
version every package will move to — exactly what the release workflow will
do, before a release is on the line — and it is where you catch the
peer-dependency majoring trap below.

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
	"changelog": ["@changesets/changelog-github", { "repo": "Anti049/test" }],

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
	"fixed": [["@anti049/test", "@anti049/test-svelte", "@anti049/test-react", "@anti049/test-vue"]],
	"linked": [],

	"access": "public",
	"baseBranch": "main",

	// When one package in the group bumps, dependents get a patch rather than
	// inheriting the same bump.
	"updateInternalDependencies": "patch",

	// The docs site is private and never published. Without this, Changesets
	// asks about it on every `bun changeset`.
	"ignore": ["@anti049/test-docs"]
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
> `bunx changeset status --verbose` — this is not something to discover at
> publish time.

> **You run `changeset version` locally to "see what happens".** There is no
> dry-run flag: it deletes the changesets it consumes, rewrites manifests and
> writes `CHANGELOG.md` files, and `git checkout` does not remove the untracked
> ones.
>
> **Fix:** `changeset status --verbose` for the numbers; a throwaway worktree
> (step 3) for the changelog text.

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

## Checkpoint

Step 9 checked the chain in your own clone, where the hooks were installed by
hand. This checks a **fresh** clone, which is what every contributor gets: the
hooks must install themselves, and every rule must bite.

**Skeleton:** a clone in `$env:TEMP\test-checkpoint\08`. Commits made here never
leave it.

```powershell
$cp = "$env:TEMP\test-checkpoint\08"
Remove-Item -Recurse -Force $cp -ErrorAction SilentlyContinue
git clone --quiet . $cp
Push-Location $cp
bun install --frozen-lockfile

# husky's `prepare` script ran on install.
git config core.hooksPath                         # .husky/_

# commit-msg: each of these must be rejected, and the message must say why.
git commit --allow-empty -m "bad message"; $LASTEXITCODE            # non-zero: type missing
git commit --allow-empty -m "feat(nope): add a thing"; $LASTEXITCODE  # non-zero: scope-enum
git commit --allow-empty -m "feat(core): Add a thing"; $LASTEXITCODE  # non-zero: subject-case
git commit --allow-empty -m "feat(core): add a thing"; $LASTEXITCODE  # 0

# pre-commit: lint-staged reformats what is staged.
'export const  probe  =  1' | Set-Content packages/core/probe.ts
git add packages/core/probe.ts
git commit -m "chore(core): probe the pre-commit hook"
git show HEAD:packages/core/probe.ts              # export const probe = 1;

# Changesets: the plan for one minor change to the plugin.
@'
---
'@anti049/test': minor
---

Checkpoint entry.
'@ | Set-Content .changeset/checkpoint.md
git add .changeset; git commit -m "chore(repo): add a checkpoint changeset"
bunx changeset status --verbose
```

Read the `status` output. The plugin is listed as `minor`. If `fixed` groups
the four publishable packages, the three bindings are listed too, at the
**same** new version. The docs site is not listed at all.

```powershell
Pop-Location
Remove-Item -Recurse -Force $cp
```

**Passes when** every line prints what its comment says and the release plan
reads as above.

**If it does not:** an empty `core.hooksPath` means the `prepare` script did
not run on install — check it is in the root `package.json`, not just in your
shell history. A binding listed as `major` is the peer-dependency trap below:
a peer range on the plugin that the bump falls outside of.

---

Next: [GitHub](09-github.md)
