# 0. Prerequisites and decisions

Five decisions here are expensive to reverse. Make them deliberately.

---

## Toolchain

| Tool       | Version | Why this one                                                                               |
| ---------- | ------- | ------------------------------------------------------------------------------------------ |
| Node       | ≥ 22    | The registry tooling and `corepack` assume it. Even on Bun, publishing goes through `npm`. |
| Bun        | ≥ 1.2   | Runs TypeScript directly, which removes a compile step from the plugin build.              |
| Git        | ≥ 2.40  | `git switch`, and sane `--no-rebase` defaults.                                             |
| GitHub CLI | ≥ 2.40  | Required to import the roadmap. `gh auth login` before you start.                          |
| VS Code    | current | The debugging and enforcement setup in guides 5 and 8 is VS Code specific.                 |

```powershell
node --version; bun --version; git --version; gh --version
```

**Do not install Tailwind globally.** The plugin build shells out to the Tailwind
CLI from `node_modules`, and a global copy on a different minor version produces
output that disagrees with the test harness in ways that take hours to find.

---

## Name it once, and substitute

Three placeholders run through every guide. Decide them before you start — a
rename after the first publish means a deprecation notice on the old name, a
redirect nobody reads, and a week of stale links.

| Placeholder    | What it is                           | Example         | Where it appears                                |
| -------------- | ------------------------------------ | --------------- | ----------------------------------------------- |
| `@scope`       | your npm scope, with the leading `@` | `@moonlight-ui` | every `package.json`, every import, `@plugin`   |
| `project-name` | the package and repository name      | `moonlight`     | package names, directory paths, the Pages URL   |
| `acme`         | your GitHub user or organisation     | `nploetz049`    | repository URLs, CODEOWNERS, the roadmap import |

Check the scope is free before committing to it:

```powershell
# Quote the name: PowerShell treats a bare leading @ as a splat expression.
npm view '@scope/project-name'          # E404 means available
```

### Substituting them

Markdown has no variables, so the blueprint ships a script that rewrites the
placeholders in place. Run it once and every command in every guide becomes
copy-pasteable, with nothing left to translate in your head:

```powershell
# See what would change, without writing anything.
bun blueprint/personalise.ts --scope '@moonlight-ui' --name moonlight --owner nploetz049 --dry-run

# Do it.
bun blueprint/personalise.ts --scope '@moonlight-ui' --name moonlight --owner nploetz049
```

It touches nothing outside `blueprint/`, and refuses to run on a dirty working
tree — there is no undo beyond `git checkout`. `--holder` sets the LICENSE
copyright holder if that differs from the GitHub owner.

**If you would rather not**, the rest of the guides read perfectly well with the
placeholders in place. Substituting is a convenience, not a step.

---

## Versions — take the latest, except twice

Every version in these guides is the current release as of **17 September
2026**. Check for newer ones before you start; nothing here depends on an old
release.

```powershell
# What you would actually get today.
npm view typescript version; npm view eslint version; npm view svelte version
```

Two packages are deliberately **not** on their latest major, because a peer
range says they cannot be. Both are worth knowing about, because the symptom in
each case is a crash inside a dependency rather than a resolution error.

| Package      | Latest | This guide | Why                                                                                                                                                    |
| ------------ | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `typescript` | 7.0.x  | `~6.0.3`   | `typescript-eslint` declares `typescript: >=4.8.4 <6.1.0`, and `svelte-check` declares `^5 \|\| ^6`. Neither supports 7 yet, and `vue-tsc` trails it.  |
| `eslint`     | 10.x   | `^9.7.0`   | `eslint-plugin-react` declares `eslint: … \|\| ^9.7` — it has no ESLint 10 support. ESLint 10 removed `context.getFilename()`, which the plugin calls. |

Check both before assuming they are still true:

```powershell
npm view typescript-eslint peerDependencies
npm view eslint-plugin-react peerDependencies
```

**On ESLint specifically:** everything else in this toolchain works on 10. If
you are not shipping React bindings, take 10 and skip the React plugin
entirely. If you are, and you would rather stay on 10 than wait for the plugin,
[guide 1](01-monorepo.md) step 7 scopes the React config to `**/*.{jsx,tsx}`
and names `settings.react.version` explicitly — which avoids the one crash path
that is known, with no guarantee about the others.

**`~` rather than `^` on TypeScript** is deliberate: the peer range excludes
6.1, so a caret would eventually resolve to a version typescript-eslint
refuses. It is the only pinned-to-minor dependency in the repository.

---

## Shells — read this before running anything

The commands in these guides are written for **PowerShell 7+** (`pwsh`), which is
what a current Windows machine has. Most of them — `bun`, `git`, `node`, `npm`,
`gh` — are identical in every shell and are shown once. Where a command is
genuinely shell-specific, both forms are given, labelled `powershell` and `sh`.

Check you are on PowerShell 7, not Windows PowerShell 5.1:

```powershell
$PSVersionTable.PSVersion    # Major must be 7 or greater
winget install Microsoft.PowerShell   # if it is not
```

This matters more than it looks. PowerShell 7 added `&&`, `||`, `??` and the
ternary operator. On 5.1 every chained command in these guides is a parse error.

### The seven differences that actually come up

| Task                     | POSIX                 | PowerShell 7                                                              |
| ------------------------ | --------------------- | ------------------------------------------------------------------------- |
| Several directories      | `mkdir -p a/{b,c}`    | `mkdir a/b, a/c` — `New-Item` takes an array; there is no brace expansion |
| Directory, ignore exists | `mkdir -p a`          | `New-Item -ItemType Directory -Force a`                                   |
| Delete a tree            | `rm -rf x`            | `Remove-Item -Recurse -Force x`                                           |
| Ignore "not found"       | `… 2>/dev/null`       | `… -ErrorAction SilentlyContinue`                                         |
| One-shot env var         | `KEEP_TMP=1 bun x.ts` | `$env:KEEP_TMP = 1; bun x.ts` — there is no inline prefix form            |
| Line continuation        | trailing `\`          | trailing backtick `` ` ``                                                 |
| Temp directory           | `/tmp`                | `$env:TEMP`                                                               |

Searching and slicing files come up often enough to be worth memorising:

```powershell
Get-Content file.css -TotalCount 20          # head -20
Get-Content file.css -Tail 20                # tail -20
Select-String -Path file.css -Pattern '\.badge'          # grep
(Select-String -Path file.css -Pattern '\.badge').Count  # grep -c

# grep -oE '…' | sort -u
(Select-String -Path out.css -Pattern 'var\(--[-a-z0-9]+\)' -AllMatches).Matches.Value |
	Sort-Object -Unique
```

### Three things that stay POSIX even on Windows

These are not oversights, and converting them breaks things:

1. **Git hook bodies** (`.husky/commit-msg`, `.husky/pre-commit`, guide 8). Git
   for Windows runs hooks under its own bundled `sh`, never under PowerShell.
   Write them as POSIX shell.
2. **GitHub Actions `run:` steps** (guide 9). They execute on `ubuntu-latest`,
   so they are bash regardless of what you author them on.
3. **`package.json` scripts.** npm and Bun run these through `cmd.exe` on
   Windows — not PowerShell, and not `sh`. So a script may not contain `cp`,
   `rm`, `&&`-with-POSIX-tools, or `$(…)`. Use a Node one-liner, which works
   everywhere:

   ```json
   "clean": "node -e \"require('node:fs').rmSync('dist',{recursive:true,force:true})\""
   ```

   or a cross-platform helper (`rimraf`, `cpy-cli`). [Guide 5](05-react.md)
   step 3 has the `cp` case, which is the one that bites.

### Two Windows settings to change now

```powershell
# Workspace links are symlinks. Without Developer Mode, `bun install` needs an
# elevated shell or silently falls back to copying, and edits to one package
# stop being visible to another.
Start-Process ms-settings:developers

# node_modules in a monorepo exceeds 260 characters routinely.
git config --global core.longpaths true
```

Leave `core.autocrlf` **off** (`git config --global core.autocrlf false`). The
plugin's test harness compares compiled CSS byte for byte, and line-ending
rewriting on checkout makes a clean tree fail its own parity test.

---

## Decision 1 — package manager

**Take Bun** unless you have a reason not to. It runs the build scripts as
TypeScript with no compile step, and its workspace protocol is the same as npm's.

What you are accepting:

- `bun run --filter` **serialises on workspace dependencies**. If `docs` depends
  on `core`, a long-running `dev` script in `core` blocks `docs` from ever
  starting. Guide 7 works around this by having the docs server spawn the
  watcher as a child.
- Bun is more forgiving than Node about malformed ESM in dependencies. Something
  that works under `bun` can fail under `node`, and will fail under Vite's SSR,
  which runs on Node. Guide 3 has a concrete case.

pnpm is the good alternative; its strict linking catches missing dependencies
that Bun's hoisting hides. npm workspaces work but are slow at this size.

---

## Decision 2 — the scope and the package names

```text
@scope/project-name           the plugin        ← the short name goes to the plugin
@scope/project-name-svelte    Svelte bindings
@scope/project-name-react     React bindings
@scope/project-name-vue       Vue bindings
```

The plugin takes the bare name because it is the thing people install first and
the thing they name in `@plugin`. Framework packages are suffixed, not scoped
into subpaths — `@scope/project-name/svelte` would force one package to contain
every framework's dependencies.

Check availability before writing a line of code:

```powershell
# Quote the name: PowerShell treats a bare leading @ as a splat expression.
npm view '@scope/project-name'          # E404 means available
npm view '@scope/project-name-svelte'
```

**The directory names do not have to match the package names.** Using
`packages/core`, `packages/svelte`, `packages/react`, `packages/vue`,
`packages/docs` keeps paths short and makes the tree readable at a glance. The
manifest's `name` field is what the registry sees.

---

## Decision 3 — how components are authored

This is the deepest decision in the repository, and it is nearly invisible until
you are a long way in.

_Every snippet in this decision is illustrative — none of it is a file you create
here. [Guide 2](02-plugin.md) is where the real files start._

**Option A — plain class selectors**

```css
@layer project.l1.l2.l3 {
	.badge {
		display: inline-flex;
	}
}
```

**Option B — Tailwind `@utility` blocks**

```css
@utility badge {
	@layer badge.l1.l2.l3 {
		@apply inline-flex items-center;
	}
}
```

Measured plugin-to-plugin, they are **indistinguishable to a consumer**. Both get
variants (`md:badge`, `hover:badge`), both tree-shake to only the classes used,
both land the component in a sublayer of `utilities` so a plain `p-8` overrides
it, and `@apply` works inside either.

The differences are all build-side:

|                                      | Plain selectors | `@utility`                                     |
| ------------------------------------ | --------------- | ---------------------------------------------- |
| Emitted when unused                  | Yes, always     | **No** — usage-gated, needs a safelist         |
| Functional utilities (`badge-gap-*`) | Impossible      | Supported                                      |
| Build complexity                     | Lower           | Needs safelist extraction, collision detection |
| Classes written by JS at runtime     | Work            | **Silently never emitted**                     |

### What "classes written by JS at runtime" means

Tailwind finds classes by **scanning files as text**, looking for substrings
shaped like class names. It never executes anything, resolves an import, or
evaluates an expression. A class name that only comes into existence once code
runs is therefore invisible to it — there is no candidate, so a gated rule is
never emitted.

Two shapes of this, with different blast radii.

**1. Your library creates the element.** The class name lives inside your
shipped JavaScript and never appears in the consumer's own source:

```ts
// packages/svelte/src/lib/actions/ripple.ts
export function ripple(node: HTMLElement) {
	node.addEventListener('pointerdown', (event) => {
		const circle = document.createElement('span');
		circle.className = 'project-ripple'; // ← only string in the world
		node.append(circle);
	});
}
```

The consumer writes `<button use:ripple>`, never the words `project-ripple`. Your
package's JS does contain the literal — but a consumer's Tailwind scan skips
`node_modules` by default, so it is never read. The rule is not emitted, the
ripple renders as an unstyled `<span>`, and **nothing warns anybody**. This one
affects _every_ consumer, always.

Same failure, other common forms:

```ts
element.classList.add('project-dragged'); // toggled state class
document.body.classList.toggle('project-scroll-lock'); // global lock class
portalRoot.className = 'project-portal'; // injected container
```

**2. The consumer composes the name.** The literal never exists even in their own
source, because it is assembled at runtime:

```svelte
<!-- The scanner sees `badge-` and a variable. Not `badge-primary`. -->
<span class="badge badge-{variant}">{count}</span>
```

```tsx
<span className={`badge badge-${variant}`} />            // same problem
<span className={'badge-' + status} />                   // same problem
<span className={STATUS_CLASS[status]} />                // worse — indirect
```

This one is the consumer's to fix (safelist, or a lookup map with **whole class
names** as values), but it is yours to _document_, because they will report it as
a bug in your library:

```ts
// Works: every complete class name appears as a literal.
const STATUS_CLASS = {
	ok: 'badge-success',
	warn: 'badge-warning',
	bad: 'badge-error'
} as const;
```

**How to tell it has happened:** the element is in the DOM with the right class
in DevTools, and no rule matches it. Searching the compiled CSS for the class
name returns nothing. It is not a specificity problem — the declaration was never
emitted at all.

**The fix for case 1**, if you have already chosen `@utility`: route those rules
through `addBase` rather than `addUtilities`, which emits them unconditionally.
Keep the list of such classes in one named constant so it is greppable, and pin
it with a test that asserts the rule appears when no candidate exists. Guide 2
has the detail.

With plain selectors the problem does not arise: nothing is gated, so the rule is
there whether or not anyone wrote the name.

---

**Take plain selectors unless you need functional utilities.** The usage gate is
the source of the worst class of bug in this whole design, for the reasons above:
it fails silently, at the consumer's build, for a class your own code created.
Guide 2 covers the escape hatch, but not needing it is better.

Option B's one unspent advantage: if you ever ship a stylesheet alongside the
plugin, `@utility` keeps it gated and variant-capable, where plain selectors must
pre-expand every breakpoint into the file.

---

## Decision 4 — cascade layer shape

Components need internal priority: a variant must beat the base, a state must
beat the variant. Two ways to express it.

**Named siblings** — `badge.l3`, `badge.l2`, `badge.l1`. Priority comes from
declaration order, so moving a block silently changes what wins.

**Nested depth** — `badge.l1.l2.l3`, `badge.l1.l2`, `badge.l1`. Unlayered content
of a layer outranks that layer's sublayers, so **deeper is weaker**, and that
holds regardless of order or which file a rule came from.

**Take nested depth.** It costs nothing and removes an entire category of
"why did this stop working when I moved it" bug.

Keep the component name as the first segment (`badge.l1.l2.l3`, not
`project.l1.l2.l3`). The build reads that segment to decide which bundle a rule
belongs to. A single shared root reads nicely but throws away the only signal
that distinguishes _your_ `.table` rule from Tailwind's built-in one.

```css
@layer badge.l1.l2.l3 {
} /* foundation — weakest */
@layer badge.l1.l2 {
} /* variant, size, colour */
@layer badge.l1 {
} /* state: disabled, selected */
```

---

## Decision 5 — how colour is themed

Two shapes, and they are not easy to swap between once consumers are writing
`@plugin` bodies against one of them.

**Hand-authored themes.** Each theme is a CSS file of semantic roles —
`--theme-color-primary`, `--theme-color-on-primary`, and so on. Simple, no
dependencies, and every colour is exactly what somebody chose. The cost is that
each theme is a few hundred hand-picked values, a new semantic role means
editing every theme, and consumers cannot make their own without doing all of
that work themselves.

**Generated from a seed.** A theme is one colour plus a scheme algorithm, which
produces a full tonal palette. Adding a theme is one line, consumers can
generate their own from a brand colour, and a new role is derived everywhere at
once. The costs are a colour-science dependency, a three-layer indirection
between "the token a component reads" and "a hex value", and generated colours
nobody explicitly chose.

**Take generated, with hand-declared roles able to override.** That is the
combination that works: generate the palette, then let a theme pin the handful
of roles it cares about. It keeps both properties — a one-line theme, and exact
control where exact control is wanted — and it is what makes a "Generate a
theme" page in the docs possible at all.

Decide now, because it determines:

- whether you take `@material/material-color-utilities` (or an equivalent) as a
  dependency, which has [SSR consequences](07-docs.md#8-handle-ssr-hostile-dependencies)
- whether themes are data or CSS, which decides whether the docs site can
  preview one
- the shape of the `@plugin '.../theme'` option surface, which is public API
  from the first publish

[Guide 14](14-themes.md) builds the generated version end to end, including the
hand-declared override path.

---

## A repository-wide rule worth adopting on day one

**Derive lists from source; never hand-maintain them.**

Every registry in this design — component class names, custom variants, theme
namespaces, functional utilities — is extracted from the CSS at build time. Every
time one of those has been hand-written instead, it has shipped incomplete, and
nobody noticed until a consumer reported a missing class.

If you are about to type out a list of things that already exist in the CSS,
write an extractor instead. It is almost always fewer lines than the list.

---

Next: [Monorepo skeleton](01-monorepo.md)
