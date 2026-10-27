# 13. Release and operations

Publishing, and what to do when it goes wrong.

Ten steps. Steps 1–3 are the first publish and happen once; 4–5 are every
release after that; 6–10 are the parts nobody writes down and everybody needs.

---

## 1. Work the first-publish checklist

Before the first `npm publish`, confirm all of these. Several are unrecoverable
or embarrassing to fix later.

- [ ] `LICENSE` file exists and every `package.json` has a matching `license`
      field. Without it npm shows UNLICENSED and nobody can legally use it.
- [ ] `repository.url` and `repository.directory` are set per package, so npm
      links to the right subdirectory.
- [ ] `files` is explicit. Do not rely on `.npmignore`.
- [ ] `publint` and `attw` are clean.
- [ ] `README.md` exists **in each package** — npm shows the package's own, not
      the root one.
- [ ] `keywords` include `tailwindcss` and `tailwind-plugin`; that is how people
      find it.
- [ ] Names are actually available: `npm view @anti049/test`.
- [ ] The full rehearsal passes: `bun run rehearse`
      ([guide 17](17-rehearsal.md)). This is the one that sees what a consumer
      sees.

The name check is the one to do **first**, not last. Discovering the scope is
taken after you have written four `package.json` files, a README and a docs site
full of `@anti049/…` imports is an afternoon of find-and-replace.

---

## 2. Dry-run, and read the file list properly

```powershell
npm login
bun run build:packages
cd packages/core && npm publish --access public --dry-run
```

Read that file list line by line. It is the last cheap moment to notice you are
shipping `src/` or missing `dist/`. Specifically check:

- `dist/` is present and non-empty
- `src/`, `test/`, `functions/` are **absent**
- `README.md` and `LICENSE` are present
- the total size is what you expect — an unexpected megabyte is a `node_modules`
  or a sourcemap you did not mean to ship

---

## 3. Publish the first version

Let the workflow do it if it is ready ([guide 9](09-github.md), step 3) — CI
publishing packs from a clean checkout, which rules out a whole family of
mistakes. If you are publishing by hand for the first release:

```powershell
cd packages/core && npm publish --access public
```

Then immediately verify from the outside, in a directory that is not the repo:

```powershell
# Outside the repo, so the workspace link cannot satisfy it.
Set-Location $env:TEMP
npm view '@anti049/test'
bun add '@anti049/test'   # in a scratch app; compile something with it
```

`--access public` is required for the first publish of a scoped package. After
that npm remembers, but `publishConfig.access` in the manifest means you never
have to.

---

## 4. Run a routine release

1. PRs merge to `main`, each with a changeset.
2. The release workflow opens **Version Packages**.
3. Review it (step 5).
4. Merge → the workflow publishes and tags.

That is the whole loop, and it should stay boring. The moment a release needs a
person to remember a manual step, that step gets skipped under pressure.

---

## 5. Review the Version PR

The only human gate. Check four things:

- **The bumps are right.** A breaking change typed `patch` is the expensive
  mistake. Below 1.0, breaking is `minor`.
- **The changelog reads as release notes**, not as commit subjects. If an entry
  says "fix: handle undefined", rewrite it — you can edit the changeset files in
  the PR and push; Changesets re-computes.
- **Peer ranges updated.** With `fixed` groups the bindings move together; make
  sure their peer range on the plugin followed.
- **Nothing unexpected is being published.** The docs site must not appear.

---

## 6. Treat class names and tokens as public API

A design system has a surface most libraries do not: **the CSS class names and
tokens are public API**. People write `class="button button-filled"` in their
markup. Renaming a class is every bit as breaking as renaming an exported
function, and far more likely to be done casually.

Treat as breaking:

- renaming or removing any emitted class
- renaming a token (`--radius-field` → `--rounded-field`)
- changing a layer's name or depth — it changes override behaviour
- changing an `@plugin` option name
- starting to reject an option that used to be ignored

When you must rename, **ship both for one minor**, with the old one documented as
deprecated, then remove it in the next. Cheap to do, and it turns a broken build
into a warning. In a CSS plugin the old name is usually three lines that
`@apply` the new one.

---

## 7. Deprecate; never unpublish

**Never `npm unpublish`.** It breaks every lockfile pinning that version, and
after the first 72 hours npm usually refuses it anyway. Even when it succeeds,
that version number can never be published again.

```powershell
npm deprecate @anti049/test@1.2.3 "Broken theme resolution; use 1.2.4"
```

Then publish a fixed patch. The deprecation shows on install without breaking
anyone already pinned.

Deprecate the **exact version**, not a range, unless you really mean the range —
`@anti049/test@"<2"` deprecates every 1.x release including the good ones,
and undoing it means a second `npm deprecate` with an empty message.

---

## 8. Know the recovery for each failure

| Symptom                                | Do this                                                                                                         |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Published with a bug                   | `npm deprecate` that version, publish a patch. Do not unpublish.                                                |
| Published wrong contents               | Same. Fix `files`, bump, republish.                                                                             |
| Some packages published, others failed | Publish the rest manually with the same version. `fixed` groups make partial states confusing; resolve quickly. |
| Version PR proposes wrong bumps        | Edit the changeset files in the PR, push. Changesets re-computes.                                               |
| Tag exists but publish failed          | Delete the tag, re-run the workflow. The registry, not the tag, is the source of truth.                         |

Every row assumes you go **forward**, never backward. There is no state of the
npm registry you can restore; there is only a newer version.

---

## 9. Support consumers through a break

**A migration guide per breaking release**, in the docs site, with before/after
for each change. Link it from the changelog entry. This is the single highest-
value piece of documentation you will write, and the easiest to skip.

**A codemod when a rename is mechanical.** Even a documented `sed` is better than
nothing:

```powershell
# 1.x -> 2.0: `seed:` becomes `seed-primary:`
Get-ChildItem -Recurse -Filter *.css | ForEach-Object {
	$path = $_.FullName
	(Get-Content $path -Raw) -replace '\bseed:', 'seed-primary:' |
		Set-Content $path -NoNewline
}
```

<details>
<summary>bash / zsh</summary>

```sh
rg -l "seed:" --glob '*.css' | xargs sed -i 's/\bseed:/seed-primary:/g'
```

</details>

**A version matrix** in the README, so people can see at a glance which Tailwind
and which framework versions a release supports:

| Release | Tailwind | Svelte | React        | Vue  |
| ------- | -------- | ------ | ------------ | ---- |
| 2.x     | ^4.0     | ^5.0   | ^18 \|\| ^19 | ^3.5 |
| 1.x     | ^4.0     | ^5.0   | ^18          | ^3.4 |

---

## 10. Keep the operational habits

- **Watch the first hour after a publish.** Most packaging bugs surface
  immediately, from someone installing fresh.
- **Keep a scratch consumer app** outside the repo and install each release into
  it before announcing. It catches what the monorepo's own resolution hides.
- **Record architecture decisions.** A short `docs/decisions/NNN-title.md` per
  significant choice — why plugin over stylesheet, why nested layers, why plain
  selectors. Six months later nobody remembers, and the reasoning is what stops
  someone undoing it.
- **Keep an `ARCHITECTURE.md` of verified toolchain behaviour.** Everything in
  these guides' Traps sections cost real time to establish. Write them down where
  the next person — and the next agent — will read them.

---

## Files after this phase

**This guide creates no files.** It is the only one that does not, and that is
worth saying explicitly rather than leaving you looking for a manifest that is
not there.

What it changes instead:

| Thing                             | Changed by           | Committed?                         |
| --------------------------------- | -------------------- | ---------------------------------- |
| `packages/*/package.json` version | `changeset version`  | Yes — in the Version PR            |
| `packages/*/CHANGELOG.md`         | `changeset version`  | Yes — created on the first release |
| `.changeset/*.md`                 | consumed and deleted | Yes — their removal is the diff    |
| Git tags (`@anti049/name@1.2.0`)    | `changeset publish`  | Pushed by the release workflow     |
| The npm registry                  | `changeset publish`  | Not a file, and not reversible     |

Every one of these is produced by the workflow from
[guide 9](09-github.md) step 3. You should never edit a `CHANGELOG.md` or a
version field by hand — the next `changeset version` overwrites the version and
appends above your changelog edit, so a hand-fix survives exactly one release
and then confuses whoever finds it.

The one exception: **the changeset files in an open Version PR are editable.**
That is the intended way to reword a release note. Push to the PR branch and
Changesets re-computes.

---

### What you should write, that this guide does not

Two things this guide recommends but cannot template, because they are specific
to what you broke:

- `packages/docs/src/routes/migrating/<version>/+page.svelte` — a migration guide
  per breaking release, with before/after for each change. Link it from the
  changelog entry.
- A codemod, when a rename is mechanical. Even a documented `-replace` is
  better than nothing.

Both are covered in step 9.

---

## Traps

> **Publishing from a dirty working tree.** `npm publish` packs the working
> directory, not the commit. Uncommitted experiments ship. CI publishing avoids
> this entirely, which is the main reason to do it there.

> **`--frozen-lockfile` missing in the release job.** You publish against
> dependency versions you never tested.

> **Provenance configured halfway.** `NPM_CONFIG_PROVENANCE: true` without
> `id-token: write` fails the publish rather than skipping provenance.

> **The docs site deploys from a different commit than the packages.** If docs and
> release are separate workflows on the same push, they can interleave and the
> site can document a version that has not published yet. Gate the docs deploy on
> the release job, or accept a brief window and say so.

> **A deprecation range that swallows the good versions.** `npm deprecate` takes a
> semver range, and a careless one marks your entire 1.x line as broken on every
> consumer's install. Deprecate exact versions.

---

## Checkpoint

npm will not let you take a publish back, so rehearse the operations in this
guide against a registry that will: **Verdaccio**, a private npm registry
running on your machine. Publish, install by name, deprecate, publish a patch
over it — all of it, before any of it is real.

**Skeleton:** a registry in `$env:TEMP\test-checkpoint\13\registry`, a clone
that publishes to it, and a consumer that installs from it.

```powershell
New-Item -ItemType Directory -Force "$env:TEMP\test-checkpoint\13\registry" | Out-Null
```

**`$env:TEMP\test-checkpoint\13\registry\config.yaml`** — new file:

```yaml
storage: ./storage
auth:
  htpasswd:
    file: ./htpasswd
uplinks:
  npmjs:
    url: https://registry.npmjs.org/
packages:
  # No `proxy` for your scope: it never falls through to the real registry, so
  # a package of the same name on npmjs cannot be installed by mistake.
  '@anti049/*':
    access: $all
    publish: $authenticated
  '**':
    access: $all
    proxy: npmjs
log: { type: stdout, format: pretty, level: warn }
```

In a **second terminal**, start it:

```powershell
npx --yes verdaccio@6 --config "$env:TEMP\test-checkpoint\13\registry\config.yaml" --listen 4873
```

Back in the first, from the repository root:

```powershell
$cp  = "$env:TEMP\test-checkpoint\13"
$reg = 'http://localhost:4873'
Remove-Item -Recurse -Force "$cp\repo", "$cp\app" -ErrorAction SilentlyContinue
git clone --quiet . "$cp\repo"
Push-Location "$cp\repo"
bun install --frozen-lockfile

# Provenance needs a CI identity, so it fails on a laptop. Strip it in the clone only.
'core', 'svelte', 'react', 'vue' | ForEach-Object { npm pkg delete publishConfig.provenance --prefix "packages/$_" }

npm adduser --registry $reg --auth-type=legacy    # any username and password; Verdaccio creates it

# The same command release.yml runs, pointed at the local registry.
$env:npm_config_registry = $reg
bun run build:packages
bunx changeset publish
Remove-Item Env:npm_config_registry

npm view '@anti049/test' version --registry $reg          # 0.0.0
npm view '@anti049/test-docs' --registry $reg 2>&1 | Select-String E404   # the docs site never publishes
git tag                                                    # one tag per published package
Pop-Location
```

Install **by name**, the way a consumer does — unlike a tarball, this resolves
the peer graph through the registry:

```powershell
New-Item -ItemType Directory -Force "$cp\app" | Out-Null
Push-Location "$cp\app"
'{ "name": "consumer", "private": true, "type": "module" }' | Set-Content package.json
npm install --no-audit --no-fund --registry $reg '@anti049/test' '@anti049/test-react' react react-dom
npm ls '@anti049/test'                                     # one copy, deduped under the binding

# Step 7: deprecate, never unpublish.
npm deprecate '@anti049/test@0.0.0' 'Checkpoint: use 0.0.1' --registry $reg
npm install --no-audit --no-fund --registry $reg '@anti049/test@0.0.0'   # prints the deprecation warning
Pop-Location

# A published version cannot be replaced — only superseded.
Push-Location "$cp\repo\packages\core"
npm publish --registry $reg; $LASTEXITCODE                 # non-zero: cannot publish over 0.0.0
npm version patch --no-git-tag-version
npm publish --registry $reg
Pop-Location
npm view '@anti049/test' versions --registry $reg          # [ '0.0.0', '0.0.1' ]
```

Then clean up: `npm logout --registry http://localhost:4873`, stop Verdaccio
with Ctrl-C, and `Remove-Item -Recurse -Force "$env:TEMP\test-checkpoint"`.

**Passes when** every line prints what its comment says.

**If it does not:** a `changeset publish` that publishes the docs site means
`private: true` is missing from its manifest. Two copies of the plugin under
`npm ls` is a binding whose peer range does not include the version that
published. A republish of the same version that succeeds is not something npm
will ever do — check you were not still pointed at a fresh Verdaccio storage.

---

Back to the [index](../README.md) · Then the [roadmap](../roadmap/README.md)

The three guides that extend the plugin — [14. The token layer](14-tokens.md),
[15. Themes](15-themes.md) and
[16. The plugin option surface](16-options.md) — are done after guide 2, not
after this one.
