# 3. Framework bindings — the shared contract

Three packages over one plugin. This guide is what they have in common; the
per-framework setup is next:

- [4. Svelte](04-svelte.md)
- [5. React](05-react.md)
- [6. Vue](06-vue.md)

Read this one first. Every rule here applies to all three, and the three
per-framework guides assume it.

---

## What belongs in a binding, and what does not

| Belongs                          | Does not                            |
| -------------------------------- | ----------------------------------- |
| Markup structure the CSS expects | Colours, spacing, radii             |
| Keyboard and focus behaviour     | Anything expressible as a class     |
| ARIA wiring                      | Framework-specific theming APIs     |
| Controlled/uncontrolled state    | A second source of truth for tokens |
| Forwarding refs and rest props   | Re-implementing a variant in JS     |

If you find yourself writing `style={{ background: … }}`, the plugin is missing a
class. Add it there instead — otherwise you have to add it three times, and the
three will drift.

---

## The five rules

**1. The plugin is a peer dependency, never a dependency.** A consumer installs
one copy and every binding uses it. As a `dependency` you get three copies, three
sets of tokens, and a support burden nobody enjoys.

**`packages/{svelte,react,vue}/package.json`** — the same shape in all three:

```jsonc
// The range CONSUMERS resolve against. A real semver range, always.
"peerDependencies": {
  "@anti049/test": "^0.0.0",
  "svelte": "^5.0.0"
},
// What makes it resolve locally, inside the workspace.
"devDependencies": {
  "@anti049/test": "workspace:*"
}
```

**Do not put `workspace:^` in `peerDependencies`.** It is tempting — it resolves
locally, and some package managers rewrite it when they publish. But `npm pack`
and `npm publish` do **not**, so any tarball npm builds — every local test
tarball, and every release published through npm — carries a protocol npm
cannot install:

```text
error: Unsupported URL Type "workspace:"
```

That message names neither your package nor which field it came from, and it
only appears once somebody installs the tarball — which is exactly why
[guide 17](17-rehearsal.md) exists and checks for it.

The split above costs nothing: the `devDependencies` entry is what the workspace
links, and Changesets keeps the peer range current through
`updateInternalDependencies` in `.changeset/config.json`, so you are not bumping
three ranges by hand each release.

**2. Every package exports a `styles.css` that registers its own files.**

```css
/* packages/svelte/src/lib/styles.css */
@source '../**/*.svelte';
```

Without it, a consumer's Tailwind scan never looks inside `node_modules`, so any
utility class used _inside_ your components is tree-shaken away and the
components render unstyled. This is the single most common support question, so
document it as non-optional.

**The consumer’s own stylesheet** — not a file in your repository:

```css
@import 'tailwindcss';
@plugin '@anti049/test';
@import '@anti049/test-svelte/styles.css'; /* required */
```

**3. The component inventory is identical across all three.** A component lands
in Svelte, React and Vue, or it does not land. Divergence is how you end up
documenting three different products. There is a test for this below.

**4. Same props, same names, same defaults.** `variant`, not `kind` in one and
`type` in another. Where a framework has its own idiom — `className` versus
`class` — follow the idiom, but keep everything else identical.

**5. Class merging is predictable, and the consumer wins.** Ship a `cn()` helper
and use it everywhere.

**`packages/{svelte,react,vue}/src/lib/utils/cn.ts`** — byte-identical in all
three packages:

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
```

`twMerge` resolves conflicts in favour of the last value, so a consumer passing
`class="rounded-full"` beats the component's own `rounded-sm`. Put the incoming
class last, always.

---

## Directory shape

The same in each package, so moving between them is muscle memory:

```text
packages/<framework>/
├─ src/
│  ├─ lib/
│  │  ├─ components/       one file per component, plus an index
│  │  ├─ actions|hooks/    framework-idiomatic behaviour
│  │  ├─ utils/cn.ts
│  │  ├─ styles.css        the @source registration
│  │  └─ index.ts          the public surface
│  └─ routes|demo/         a local playground, not published
├─ package.json
└─ tsconfig.json
```

---

## Keeping the three honest

One test, run from any package that can import all three. It catches the drift
that documentation cannot.

**`packages/core/test/unit/export-parity.test.ts`** — new file:

```ts
test('every binding exports the same component set', async () => {
	const [svelte, react, vue] = await Promise.all([
		import('../../svelte/dist/index.js'),
		import('../../react/dist/index.js'),
		import('../../vue/dist/index.js')
	]);
	const names = (m: object) =>
		Object.keys(m)
			.filter((k) => /^[A-Z]/.test(k))
			.sort();

	expect(names(react)).toEqual(names(svelte));
	expect(names(vue)).toEqual(names(svelte));
});
```

It requires all three to be built, so run it in CI after `build:packages` rather
than in a watch loop.

---

## Files after this phase

This guide is a contract, not a build step — it creates exactly one file. The
patterns it defines are implemented three times over in guides
[4](04-svelte.md), [5](05-react.md) and [6](06-vue.md).

| File                                            | Status | Written in | Next touched by                 |
| ----------------------------------------------- | ------ | ---------- | ------------------------------- |
| `packages/core/test/unit/export-parity.test.ts` | added  | this guide | [12](12-testing.md) — run in CI |

Nothing else changes here. The three binding packages are still the empty
directories [guide 1](01-monorepo.md) created.

---

### `packages/core/test/unit/export-parity.test.ts`

```ts
import { expect, test } from 'bun:test';

/*
	The three binding packages must export the same component set. Nothing else
	enforces this: each package builds independently and passes its own checks
	while quietly missing a component the other two have.

	It lives in `packages/core` because that is the one package that can import
	all three without creating a dependency cycle.

	It requires all three to be BUILT — it imports from dist/, not src/, so that
	it tests what consumers actually receive. Run it in CI after
	`bun run build:packages`, never in a watch loop.
*/
test('every binding exports the same component set', async () => {
	const [svelte, react, vue] = await Promise.all([
		import('../../svelte/dist/index.js'),
		import('../../react/dist/index.js'),
		import('../../vue/dist/index.js')
	]);

	/*
		Components only. An initial capital is the convention in all three
		frameworks, which conveniently excludes `cn`, `ripple` and the hooks —
		those are allowed to differ, because each framework has its own idiom.
	*/
	const names = (module: object): string[] =>
		Object.keys(module)
			.filter((key) => /^[A-Z]/.test(key))
			.sort();

	// Svelte is the reference simply because it was written first. The
	// assertion is symmetric; which one is the baseline does not matter.
	expect(names(react)).toEqual(names(svelte));
	expect(names(vue)).toEqual(names(svelte));
});
```

**Why `dist/` and not `src/`.** Importing source would pass even when a
component is missing from the barrel, or when `exports` in `package.json` does
not list it — which are the two failures most likely to happen. Testing the
built output is what makes this worth having.

---

## Traps

> **A dependency ships extensionless internal imports.** Some packages — Google's
> `material-color-utilities` is the canonical offender — import `'../foo/bar'`
> with no `.js`. Bun resolves it. jiti resolves it. **Node's ESM resolver
> refuses**, and Vite's SSR runs on Node.
>
> **How to tell:** `ERR_MODULE_NOT_FOUND` naming a path inside `node_modules`
> that obviously exists, with `.js` missing from the end. Your unit tests pass,
> because they run under Bun.
>
> **Fix:** `ssr: { noExternal: ['the-package'] }` in the consuming Vite config,
> so Vite bundles it and fills the extension in. Consider vendoring if it is
> load-bearing.

> **You put a data export and a generator export in one module.** A consumer who
> only wants a list of theme names ends up importing your colour-generation
> library — and if that library has the ESM problem above, a _data_ import fails
> at runtime.
>
> **Fix:** keep data-only entry points genuinely dependency-free, and put
> anything that computes behind a separate export. Verify by importing the data
> entry under plain `node`, not `bun`.

> **`sideEffects: false` with a CSS import.** If any component does
> `import './x.css'`, blanket-false lets a bundler drop it and the styles vanish
> in production only.
>
> **Fix:** list them — `"sideEffects": ["**/*.css"]`.

> **Publishing `src` instead of `dist`, or nothing at all.** A root `.gitignore`
> containing `dist` is honoured by `npm pack`, which has shipped packages with
> zero files in them.
>
> **Fix:** an explicit `files` array, and read the output of
> `npm publish --dry-run` before the first release.

---

## Commit

```powershell
git add -A
git commit -m "test(core): assert export parity across bindings"
```

The test cannot pass yet — it imports three `dist/` directories that do not
exist. Commit it anyway: it is the contract guides 4–6 are written against,
and it goes green at the end of [guide 6](06-vue.md). Until then the plugin's
own `check` fails too — its unit tests include this file — so run the binding
packages' checks in guides 4 and 5, not the plugin's.

---

## Checkpoint

This guide writes a contract, not a package, so there is nothing to install
yet. Two checks: the parity test fails for the reason it should, and rule 1's
`workspace:` warning holds on your own npm.

**1. The parity test fails, and only because the bindings are not built.**

```powershell
bun test packages/core/test/unit/export-parity.test.ts
```

It must fail with `Cannot find module` naming `svelte/dist/index.js`. Any other
error — a syntax error, a missing `expect` — means the test itself is broken,
and it will still be broken when guide 6 makes those modules exist.

**2. `workspace:` survives `npm pack`.** A skeleton of two packages in
`$env:TEMP\test-checkpoint\03`, shaped the way rule 1 says not to:

```powershell
$cp = "$env:TEMP\test-checkpoint\03"
Remove-Item -Recurse -Force $cp -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$cp\packages\plugin", "$cp\packages\binding", "$cp\consumer" | Out-Null
Push-Location $cp

'{ "name": "probe", "private": true, "workspaces": ["packages/*"] }' | Set-Content package.json
'{ "name": "probe-plugin", "version": "1.0.0" }' | Set-Content packages/plugin/package.json
'{ "name": "probe-binding", "version": "1.0.0", "peerDependencies": { "probe-plugin": "workspace:^" } }' |
	Set-Content packages/binding/package.json
bun install

Push-Location packages/binding
$bad = npm pack --pack-destination $cp | Select-Object -Last 1
Pop-Location
tar -xzOf "$cp\$bad" package/package.json | Select-String 'workspace:'   # one match: not rewritten

Set-Location consumer
'{ "name": "consumer", "private": true }' | Set-Content package.json
npm install --no-audit --no-fund "$cp\$bad"; $LASTEXITCODE   # non-zero: Unsupported URL Type "workspace:"

Pop-Location
Remove-Item -Recurse -Force $cp
```

**Passes when** the parity test fails only on the missing `dist/`, and the
probe install fails on `workspace:`. That second failure is what every binding
manifest in guides 4–6 is shaped to avoid, and their checkpoints check the real
tarballs for it.

---

Next: [Svelte](04-svelte.md) · [React](05-react.md) · [Vue](06-vue.md)
