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
- [ ] Names are actually available: `npm view @scope/project-name`.
- [ ] A tarball has been installed into a scratch app and compiled
      ([guide 12](12-testing.md), step 7).

The name check is the one to do **first**, not last. Discovering the scope is
taken after you have written four `package.json` files, a README and a docs site
full of `@scope/…` imports is an afternoon of find-and-replace.

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
npm view '@scope/project-name'
bun add '@scope/project-name'   # in a scratch app; compile something with it
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
within 72 hours it is not even possible.

```powershell
npm deprecate @scope/project-name@1.2.3 "Broken theme resolution; use 1.2.4"
```

Then publish a fixed patch. The deprecation shows on install without breaking
anyone already pinned.

Deprecate the **exact version**, not a range, unless you really mean the range —
`@scope/project-name@"<2"` deprecates every 1.x release including the good ones,
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

Back to the [index](../README.md) · Then the [roadmap](../roadmap/README.md)

The three guides that extend the plugin — [14. Themes](14-themes.md),
[15. The token layer](15-tokens.md) and
[16. The plugin option surface](16-options.md) — are done after guide 2, not
after this one.
