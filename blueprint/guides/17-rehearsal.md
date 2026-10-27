# 17. Rehearsal — proving it works before you publish

Everything so far has been tested from inside the repository, where the
workspace resolves your packages by symlink and your own CSS is one directory
away. A consumer has neither. This guide builds a scratch project outside the
repo, installs real tarballs into it, and exercises **every** feature the four
packages claim to have.

Do it before the first publish, and again before any release you are nervous
about. It is the last cheap moment to find a packaging bug: after publishing,
npm will not let you replace a version, and the only way out is forward.

Fourteen steps. Steps 1–11 are the walkthrough; step 12 turns the whole thing
into one command you can run before every release.

---

## 1. Understand why a link will not do

The obvious approach is `bun link` or `npm link`, and it is worse than useless
here: a link resolves to your **working tree**. That means it silently satisfies
imports that a published package could not.

| What a link hides                           | What a consumer gets                             |
| ------------------------------------------- | ------------------------------------------------ |
| An empty or wrong `files` array             | A package with no `dist/`                        |
| A missing `exports` subpath                 | `Cannot find module '@anti049/lunar-ui/theme'` |
| `dist/` in `.gitignore`, honoured by `pack` | A tarball containing nothing                     |
| A `workspace:` range left in the manifest   | `Unsupported URL Type "workspace:"` on install   |
| A file `tsc` never emitted                  | A 404 at runtime                                 |

Each of those has shipped in a real project. A packed tarball reproduces the
consumer's situation exactly, and costs about a minute.

---

## 2. Build and pack all four packages

```powershell
bun run build:packages

$out = "$env:TEMP\lunar-ui-pkgs"
Remove-Item -Recurse -Force $out -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $out | Out-Null

# npm pack prints the filename it wrote. Capture it rather than guessing the
# pattern — it is <scope-without-@>-<name>-<version>.tgz, and hard-coding that
# breaks the first time the scope or version changes.
'core', 'svelte', 'react', 'vue' | ForEach-Object {
	Push-Location "packages/$_"
	npm pack --pack-destination $out
	Pop-Location
}

Get-ChildItem $out -Filter *.tgz | Select-Object Name, Length
```

`build:packages` first, and not `build` — the docs site must never appear in a
release rehearsal any more than in a release.

---

## 3. Read what is actually inside each tarball

The step people skip. It is the last cheap moment to notice you are shipping
`src/` or missing `dist/`.

```powershell
tar -tzf "$out\scope-lunar-ui-0.0.0.tgz"
```

Check every one of these:

- `dist/` is present and **not empty**
- `src/`, `test/` and `functions/` are **absent** — except `functions/addPrefix.js`
  and the two theme modules, which are runtime and are supposed to ship
- `README.md` and `LICENSE` are present
- the total size is what you expect; an unexpected megabyte is a sourcemap or a
  `node_modules` you did not mean to include

Then read the manifest a consumer will resolve against:

```powershell
tar -xzOf "$out\scope-lunar-ui-svelte-0.0.0.tgz" package/package.json | ConvertFrom-Json |
	Select-Object name, version, main, module, types, files, exports, peerDependencies |
	ConvertTo-Json -Depth 4
```

**Look specifically for `workspace:`.** See the trap at the end — `npm pack` does
not necessarily rewrite it, and a `peerDependencies` entry that still says
`"workspace:^"` fails at install time with a message that names neither your
package nor the protocol's origin.

---

## 4. Create a scratch consumer, outside the repository

Outside matters. Inside the workspace, Bun resolves `@anti049/*` to the local
symlinks and you have tested nothing.

```powershell
Set-Location $env:TEMP
Remove-Item -Recurse -Force scratch -ErrorAction SilentlyContinue
mkdir scratch; Set-Location scratch

# A bare manifest. No scaffolder — steps 6 to 10 compile CSS and import
# JavaScript, and need neither a framework nor a bundler.
'{ "name": "rehearsal", "private": true, "type": "module" }' | Set-Content package.json

npm install --no-audit --no-fund tailwindcss '@tailwindcss/cli'
```

**Do not scaffold an app here.** `sv create` pulls in the whole SvelteKit
toolchain, which is a minute of install for something none of the mechanical
checks use. A bare manifest plus the Tailwind CLI takes about five seconds. The
visual check in step 11 is the only part that wants a real app, and it is worth
doing separately rather than on every rehearsal.

`--no-audit --no-fund` is not cosmetic: audit contacts the registry for every
package in the tree and is pure latency here.

**Install with `npm`, not `bun`, even though the monorepo uses Bun.** See the
trap at the end: Bun resolves `peerDependencies` against the registry even when
a matching version is already installed from a tarball, so installing your
bindings fails with a 404 for a package that is sitting in `node_modules`.

That is not a downgrade. npm is the reference implementation for tarball
installs, and it is the resolver most of your consumers will be using.

If you have already tried this with `bun` and it failed, **delete the directory
and start again** rather than running `npm install` over the top. A `bun.lock`
and a half-written `node_modules` make npm re-resolve everything from a dirty
state, which is where "npm install hangs forever" comes from.

---

## 5. Install the tarballs

All four in one command, so the peer graph resolves together:

```powershell
$out = "$env:TEMP\lunar-ui-pkgs"
npm install --no-audit --no-fund `
	"$out\scope-lunar-ui-0.0.0.tgz" `
	"$out\scope-lunar-ui-svelte-0.0.0.tgz" `
	"$out\scope-lunar-ui-react-0.0.0.tgz" `
	"$out\scope-lunar-ui-vue-0.0.0.tgz"
```

About ten seconds. If it takes materially longer, something is wrong — see the
note above about starting from a clean directory.

Confirm they came from the tarballs and not from the registry:

```powershell
# Real directories, not symlinks.
Get-ChildItem node_modules/@anti049 | Select-Object Name, LinkType

# `file:` resolutions in the lockfile, not registry URLs.
Select-String -Path package-lock.json -Pattern 'scope-lunar-ui' -Context 0,2
```

---

## 6. Exercise the plugin standalone

The highest-value check in this guide: **no CSS import at all**. If the plugin
does not carry its own tokens, this is where you find out.

**`$env:TEMP\scratch\src\solo.css`** — new file.

```css
/*
	A consumer who wants the components and nothing else. No @import of your
	CSS, because there is none to import — the plugin ships its own tokens
	(guide 14).
*/
@import 'tailwindcss' source(none);
@plugin '@anti049/lunar-ui';

@source inline('badge');
@source inline('badge-primary');
@source inline('button');
@source inline('surface');
```

```powershell
$cli = node -e "const p=require('path');console.log(p.join(p.dirname(require.resolve('@tailwindcss/cli/package.json')),'dist/index.mjs'))"
node $cli -i src/solo.css -o out/solo.css

# The classes must be there.
(Select-String -Path out/solo.css -Pattern '\.badge\b').Count
(Select-String -Path out/solo.css -Pattern '\.surface\b').Count

# And every var() must resolve. This lists references with NO fallback and no
# declaration — each one is a token you forgot to ship, and it renders as a
# dropped declaration with nothing in the console.
(Select-String -Path out/solo.css -Pattern 'var\(--[-a-z0-9]+\)' -AllMatches).Matches.Value |
	Sort-Object -Unique
```

The last command should print nothing, or only Tailwind's own `--tw-*`
variables. Anything of yours in that list is a real bug.

---

## 7. Exercise the option surface

**`$env:TEMP\scratch\src\options.css`** — new file. Every option at once, which
is also a test that they compose.

```css
@import 'tailwindcss' source(none);

@plugin '@anti049/lunar-ui' {
	prefix: px-;
	exclude: tooltip;
	themes: default;
	--radius-field: 0.75rem;
	--radius-button: 0;
}

/* Prefixed candidates — the unprefixed ones must NOT resolve. */
@source inline('px-badge');
@source inline('px-button');
@source inline('badge');
```

```powershell
node $cli -i src/options.css -o out/options.css

# Renamed.
(Select-String -Path out/options.css -Pattern '\.px-badge\b').Count       # > 0
# NOT renamed: Tailwind's namespace is not yours to fork.
(Select-String -Path out/options.css -Pattern '--px-color-').Count        # 0
# Excluded bundle is absent.
(Select-String -Path out/options.css -Pattern '\.px-tooltip\b').Count     # 0
# Shape overrides reached :root.
(Select-String -Path out/options.css -Pattern '--radius-field:\s*0\.75rem').Count  # > 0
```

Then prove the **errors** fire. Every one of these must fail the compile, and
the message must name the option — an option that silently does nothing is the
failure mode the whole plugin is built to avoid.

```powershell
@'
@import 'tailwindcss' source(none);
@plugin '@anti049/lunar-ui' { --radius-feild: 0; }
'@ | Set-Content src/bad-token.css

@'
@import 'tailwindcss' source(none);
@plugin '@anti049/lunar-ui' { themes: nope; }
'@ | Set-Content src/bad-theme.css

# Both must exit non-zero, naming the mistake.
node $cli -i src/bad-token.css -o out/x.css
node $cli -i src/bad-theme.css -o out/x.css
```

---

## 8. Exercise the theme system

**`$env:TEMP\scratch\src\themes.css`** — new file.

```css
@import 'tailwindcss' source(none);
@plugin '@anti049/lunar-ui' {
	themes: default;
}

/* A generated palette, with one role overridden by hand. */
@plugin '@anti049/lunar-ui/theme' {
	name: brand;
	seed-primary: #0956aa;
	seed-secondary: #52e2ac;
	variant: vibrant;
	default: true;
	--theme-color-primary-40: #ff00ff;
}

/* Roles declared outright, no seed at all. */
@plugin '@anti049/lunar-ui/theme' {
	name: nightfall;
	--theme-color-primary: #8be9fd;
	color-scheme: dark;
}
```

```powershell
node $cli -i src/themes.css -o out/themes.css

# A full tone scale: 30 steps for the primary palette.
((Select-String -Path out/themes.css -Pattern '--theme-color-primary-\d+:' -AllMatches).Matches).Count

# The hand-declared role beat the generated one.
(Select-String -Path out/themes.css -Pattern '--theme-color-primary-40:\s*#ff00ff').Count   # > 0

# `default: true` applied where no theme is set — and did NOT emit bare :root.
(Select-String -Path out/themes.css -Pattern ':root:not\(\[data-theme\]\)').Count           # > 0

# The role-only theme exists without a seed.
(Select-String -Path out/themes.css -Pattern "\[data-theme='nightfall'\]").Count            # > 0
```

The catalogue export is JavaScript, so check it separately:

```powershell
node --input-type=module -e @'
import { THEME_NAMES, THEME_SWATCHES } from '@anti049/lunar-ui/themes';
console.log('themes:', THEME_NAMES.join(', '));
console.log('swatch roles:', Object.keys(THEME_SWATCHES[THEME_NAMES[0]].light).join(', '));
'@
```

**Run that under `node`, not `bun`.** `/themes` is the data-only entry point and
must have no runtime dependencies — Bun is forgiving about malformed ESM in
dependencies and would hide exactly the failure this checks for.

---

## 9. Exercise the functional utilities

These never survive a compile the way named utilities do, so they get their own
check.

**`$env:TEMP\scratch\src\functional.css`** — new file.

```css
@import 'tailwindcss' source(none);
@plugin '@anti049/lunar-ui';

@source inline('tooltip-gap-2');
@source inline('tooltip-gap-1.5');
@source inline('tooltip-gap-[3px]');
@source inline('tooltip-gap-[var(--x)]');
```

```powershell
node $cli -i src/functional.css -o out/functional.css

# A spacing step keeps the var(--spacing) link rather than baking in a rem.
(Select-String -Path out/functional.css -Pattern 'calc\(var\(--spacing\) \* 2\)').Count   # > 0
# An arbitrary value passes through.
(Select-String -Path out/functional.css -Pattern '3px').Count                             # > 0
# An arbitrary var() is accepted — `type: ['length']` would reject this.
(Select-String -Path out/functional.css -Pattern 'var\(--x\)').Count                      # > 0
```

---

## 10. Exercise each binding

The plugin is only three quarters of the product.

```powershell
# Every binding exports the same component set.
node --input-type=module -e @'
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Plain Node cannot load the Svelte binding: its barrel re-exports .svelte
// files, which only a bundler can compile. Read the barrel's names instead.
const barrel = fs.readFileSync(fileURLToPath(import.meta.resolve('@anti049/lunar-ui-svelte')), 'utf8');
const s = [...barrel.matchAll(/default as (\w+)/g)].map((m) => m[1]).sort();

const [r, v] = await Promise.all([
	import('@anti049/lunar-ui-react'),
	import('@anti049/lunar-ui-vue')
]);
const names = (m) => Object.keys(m).filter((k) => /^[A-Z]/.test(k)).sort();
console.log('svelte:', s.join(', '));
console.log('react: ', names(r).join(', '));
console.log('vue:   ', names(v).join(', '));
'@

# React only — the whole reason for dual output.
node -e "console.log('cjs:', Object.keys(require('@anti049/lunar-ui-react')).join(', '))"

# The styles.css export each binding promises actually exists.
'svelte', 'react', 'vue' | ForEach-Object {
	node -e "console.log('$_', require.resolve('@anti049/lunar-ui-$_/styles.css'))"
}
```

---

## 11. Render it, and look at it

Everything above is mechanical. This step is not, and it catches what the others
cannot — a component that resolves, compiles, and looks wrong.

This is the one step that needs a real application, so build one **beside** the
scratch project rather than in it:

```powershell
Set-Location $env:TEMP
bunx sv create visual --template minimal --types ts --no-add-ons --no-install
Set-Location visual
npm install --no-audit --no-fund
npm install --no-audit --no-fund -D tailwindcss '@tailwindcss/vite'
npm install --no-audit --no-fund "$out\scope-lunar-ui-0.0.0.tgz" "$out\scope-lunar-ui-svelte-0.0.0.tgz"
```

Skip this on a routine rehearsal. Do it before a first publish, and whenever a
component's markup changed.

**`$env:TEMP\visual\vite.config.ts`** — add `tailwindcss()` before
`sveltekit(…)` in `plugins`, importing it from `@tailwindcss/vite`. The
scaffold does not wire Tailwind in.

**`$env:TEMP\visual\src\routes\+layout.svelte`** — add `import '../app.css';`
to its script block.

**`$env:TEMP\visual\src\routes\+page.svelte`** — replace it.

```svelte
<script lang="ts">
	import { Button, Badge } from '@anti049/lunar-ui-svelte';
</script>

<div data-theme="brand" class="flex flex-wrap items-center gap-2 surface p-8">
	<Button variant="filled">Filled</Button>
	<Button variant="tonal">Tonal</Button>
	<Button variant="outlined" disabled>Disabled</Button>
	<Badge>3</Badge>
</div>
```

**`$env:TEMP\visual\src\app.css`** — new file. This is the file a real
consumer writes, and it should need nothing clever.

```css
@import 'tailwindcss';
@plugin '@anti049/lunar-ui';
/* Required: registers the components with this app's Tailwind scan (guide 3). */
@import '@anti049/lunar-ui-svelte/styles.css';
@plugin '@anti049/lunar-ui/theme' {
	name: brand;
	seed-primary: #0956aa;
	default: true;
}
```

```powershell
npm run dev
```

Look for: components styled, the theme applied, no console errors, and — with
`data-theme="brand"` removed — the default theme still applying.

---

## 12. Automate it

Doing all of that by hand once is worth it. Doing it before every release is
not, so make it one command.

**`scripts/rehearse.ts`** — new file, at the repository root.

```ts
/*
	Packs every publishable package, installs the tarballs into a scratch
	project outside the repository, and asserts that each feature survives the
	trip. Run before any release you are nervous about:

	    bun run rehearse

	Uses TARBALLS rather than `bun link` on purpose: a link resolves to the
	working tree and hides an empty `files` array, a wrong `exports` map, and a
	`dist/` that `.gitignore` excluded from the pack.
*/
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const scratch = path.join(os.tmpdir(), 'lunar-ui-rehearsal');
const packDir = path.join(scratch, 'pkgs');
const app = path.join(scratch, 'app');

const PACKAGES = ['core', 'svelte', 'react', 'vue'];

/** Runs a command, echoing it, and throws with the output on failure. */
function run(cmd: string, args: string[], cwd: string): string {
	console.log(`  $ ${cmd} ${args.join(' ')}`);
	try {
		return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: 'pipe' });
	} catch (error) {
		const e = error as { stdout?: string; stderr?: string };
		throw new Error(`${cmd} failed in ${cwd}:\n${e.stdout ?? ''}${e.stderr ?? ''}`);
	}
}

/** Runs a command that is EXPECTED to fail, and returns its combined output. */
function runExpectingFailure(cmd: string, args: string[], cwd: string): string {
	try {
		execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: 'pipe' });
	} catch (error) {
		const e = error as { stdout?: string; stderr?: string };
		return `${e.stdout ?? ''}${e.stderr ?? ''}`;
	}
	throw new Error(`expected \`${cmd} ${args.join(' ')}\` to fail, and it did not`);
}

const failures: string[] = [];
const check = (label: string, ok: boolean): void => {
	console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`);
	if (!ok) failures.push(label);
};

// ---------------------------------------------------------------------------
// 1. Build and pack.
// ---------------------------------------------------------------------------
fs.rmSync(scratch, { recursive: true, force: true });
fs.mkdirSync(packDir, { recursive: true });

console.log('building…');
run('bun', ['run', 'build:packages'], repoRoot);

console.log('packing…');
const tarballs: Record<string, string> = {};
for (const pkg of PACKAGES) {
	const dir = path.join(repoRoot, 'packages', pkg);
	// npm pack prints the filename it wrote; the last line is the name.
	const printed = run('npm', ['pack', '--pack-destination', packDir], dir);
	const file = printed.trim().split('\n').at(-1)!.trim();
	tarballs[pkg] = path.join(packDir, file);

	/*
		A `workspace:` range left in the manifest fails at install time with a
		message that names neither your package nor where the protocol came
		from. `npm pack` does not reliably rewrite it, so check here.
	*/
	const manifest = JSON.parse(
		execFileSync('tar', ['-xzOf', tarballs[pkg], 'package/package.json'], { encoding: 'utf8' })
	) as Record<string, Record<string, string> | undefined>;
	for (const field of ['dependencies', 'peerDependencies']) {
		const entries = Object.entries(manifest[field] ?? {});
		const bad = entries.filter(([, v]) => String(v).startsWith('workspace:'));
		check(`${pkg}: no workspace: ranges in ${field}`, bad.length === 0);
	}
}

// ---------------------------------------------------------------------------
// 2. Scratch consumer, outside the repository.
// ---------------------------------------------------------------------------
console.log('\ncreating the scratch consumer…');
fs.mkdirSync(app, { recursive: true });
fs.writeFileSync(
	path.join(app, 'package.json'),
	JSON.stringify({ name: 'rehearsal', private: true, type: 'module' }, null, '\t')
);
/*
	npm, not bun, and all four in one call.

	Bun resolves peerDependencies against the registry even when a matching
	version is already installed from a tarball — and a packed tarball has no
	registry identity, so the install 404s on a package that is already there.
	npm resolves the same tarballs correctly.
*/
/*
	--no-audit --no-fund: audit contacts the registry for every package in the
	tree, and this one is thrown away in a minute either way.
*/
run('npm', ['install', '--no-audit', '--no-fund', 'tailwindcss', '@tailwindcss/cli'], app);
run('npm', ['install', '--no-audit', '--no-fund', ...PACKAGES.map((p) => tarballs[p])], app);

const cliEntry = path.join(
	path.dirname(
		execFileSync('node', ['-e', "console.log(require.resolve('@tailwindcss/cli/package.json'))"], {
			cwd: app,
			encoding: 'utf8'
		}).trim()
	),
	'dist/index.mjs'
);

/** Writes a stylesheet, compiles it, and returns the output. */
function compile(name: string, css: string): string {
	const inFile = path.join(app, `${name}.css`);
	const outFile = path.join(app, `${name}.out.css`);
	fs.writeFileSync(inFile, css);
	run('node', [cliEntry, '-i', inFile, '-o', outFile], app);
	return fs.readFileSync(outFile, 'utf8');
}

// ---------------------------------------------------------------------------
// 3. Standalone: the plugin must carry its own tokens.
// ---------------------------------------------------------------------------
console.log('\nstandalone');
const solo = compile(
	'solo',
	[
		"@import 'tailwindcss' source(none);",
		"@plugin '@anti049/lunar-ui';",
		"@source inline('badge');",
		"@source inline('surface');"
	].join('\n')
);
check('components emit with no CSS import', /\.badge\b/.test(solo));
check('shared utilities emit', /\.surface\b/.test(solo));

const declared = new Set([...solo.matchAll(/(--[-\w]+)\s*:/g)].map((m) => m[1]));
const dangling = [
	...new Set(
		[...solo.matchAll(/var\(\s*(--[-\w]+)\s*\)/g)]
			.map((m) => m[1])
			.filter((n) => !declared.has(n) && !n.startsWith('--tw-'))
	)
];
check(`no dangling var() (${dangling.slice(0, 5).join(', ') || 'none'})`, dangling.length === 0);

// ---------------------------------------------------------------------------
// 4. The option surface.
// ---------------------------------------------------------------------------
console.log('\noptions');
const prefixed = compile(
	'options',
	[
		"@import 'tailwindcss' source(none);",
		"@plugin '@anti049/lunar-ui' { prefix: px-; --radius-field: 0.75rem; }",
		"@source inline('px-badge');"
	].join('\n')
);
check('prefix renames owned classes', /\.px-badge\b/.test(prefixed));
check('prefix leaves Tailwind namespaces alone', !prefixed.includes('--px-color-'));
check('shape override reaches :root', /--radius-field:\s*0\.75rem/.test(prefixed));

fs.writeFileSync(
	path.join(app, 'bad.css'),
	"@import 'tailwindcss' source(none);\n@plugin '@anti049/lunar-ui' { --radius-feild: 0; }"
);
const badTokenOutput = runExpectingFailure(
	'node',
	[cliEntry, '-i', path.join(app, 'bad.css'), '-o', path.join(app, 'bad.out.css')],
	app
);
check('a misspelled token is rejected by name', badTokenOutput.includes('radius-feild'));

// ---------------------------------------------------------------------------
// 5. Themes.
// ---------------------------------------------------------------------------
console.log('\nthemes');
const themed = compile(
	'themes',
	[
		"@import 'tailwindcss' source(none);",
		"@plugin '@anti049/lunar-ui';",
		"@plugin '@anti049/lunar-ui/theme' {",
		'\tname: brand;',
		'\tseed-primary: #0956aa;',
		'\tdefault: true;',
		'\t--theme-color-primary-40: #ff00ff;',
		'}'
	].join('\n')
);
check(
	'a seed generates a full tone scale',
	(themed.match(/--theme-color-primary-\d+:/g) ?? []).length === 30
);
check(
	'hand-declared roles beat generated ones',
	/--theme-color-primary-40:\s*#ff00ff/.test(themed)
);
check('the default never emits at bare :root', /:root:not\(\[data-theme\]\)/.test(themed));

// ---------------------------------------------------------------------------
// 6. Functional utilities.
// ---------------------------------------------------------------------------
console.log('\nfunctional utilities');
const functional = compile(
	'functional',
	[
		"@import 'tailwindcss' source(none);",
		"@plugin '@anti049/lunar-ui';",
		"@source inline('tooltip-gap-2');",
		"@source inline('tooltip-gap-[var(--x)]');"
	].join('\n')
);
check(
	'a spacing step keeps the var(--spacing) link',
	functional.includes('calc(var(--spacing) * 2)')
);
check('an arbitrary var() is accepted', functional.includes('var(--x)'));

// ---------------------------------------------------------------------------
// 7. The JavaScript surface, under plain node.
// ---------------------------------------------------------------------------
console.log('\njavascript');
const esm = (specifier: string): string =>
	run(
		'node',
		[
			'--input-type=module',
			'-e',
			`import(${JSON.stringify(specifier)}).then(m => console.log(Object.keys(m).join(',')))`
		],
		app
	).trim();

const names = (keys: string) =>
	keys
		.split(',')
		.filter((k) => /^[A-Z]/.test(k))
		.sort()
		.join(',');

// Plain Node cannot load the Svelte binding — its barrel re-exports .svelte
// files, which only a bundler compiles — so read the names from the barrel.
const svelteBarrel = fs.readFileSync(
	path.join(app, 'node_modules/@anti049/lunar-ui-svelte/dist/index.js'),
	'utf8'
);
const svelte = [...svelteBarrel.matchAll(/default as (\w+)/g)]
	.map((m) => m[1])
	.sort()
	.join(',');
const react = names(esm('@anti049/lunar-ui-react'));
const vue = names(esm('@anti049/lunar-ui-vue'));
check(`bindings export the same components (${svelte})`, svelte === react && react === vue);

check(
	'the React CJS build resolves',
	run(
		'node',
		['-e', "console.log(Object.keys(require('@anti049/lunar-ui-react')).length)"],
		app
	).trim() !== '0'
);

/*
	Under `node`, not `bun`. The /themes entry must be dependency-free, and Bun
	is forgiving about malformed ESM in dependencies — it would hide exactly the
	failure this checks for.
*/
check(
	'the theme catalogue imports with no runtime dependencies',
	esm('@anti049/lunar-ui/themes').includes('THEME_NAMES')
);

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------
console.log('');
if (failures.length) {
	console.log(`REHEARSAL FAILED: ${failures.length} problem(s)`);
	for (const f of failures) console.log(`  - ${f}`);
	console.log(`\nScratch project left at ${app} for inspection.`);
	process.exitCode = 1;
} else {
	console.log('REHEARSAL PASSED — the packed tarballs behave as published packages.');
	fs.rmSync(scratch, { recursive: true, force: true });
}
```

**`package.json`** — add one script at the repository root:

```json
"scripts": {
	"rehearse": "bun scripts/rehearse.ts"
}
```

On failure the scratch project is **left in place** so you can open the compiled
CSS and see what happened. On success it is deleted, so a stale scratch app
cannot mislead the next run.

---

## 13. Iterating

You will find something, fix it, and want to run it again. **Bump the version
first.**

```powershell
# In the package you changed:
npm version prerelease --preid=local --no-git-tag-version   # 0.0.0 -> 0.0.1-local.0
```

Package managers cache by name **and** version. Repacking the same version
reinstalls the cached tarball, so you debug a fix that was never installed —
and the symptom is that your change appears to have done nothing.

Reset the version before committing: Changesets owns that field, and a
hand-edited version in the tree makes the next Version PR wrong.

---

## 14. Add it to the release routine

The rehearsal is not part of `check`, because it takes a minute and builds four
tarballs. Run it deliberately:

- before the **first** publish, without exception
- before any release that changes `exports`, `files`, a build script, or a
  `peerDependencies` range
- when `publint` or `attw` reports something you do not understand

[Guide 9](09-github.md)'s release workflow runs `bun run check`, not this. If
you would rather it gated releases too, add `bun run rehearse` as a step in
`release.yml` before `changesets/action` — it is slow but it is not flaky.

---

## Files after this phase

Two files, both at the repository root. Nothing in `packages/` changes.

| File                  | Status   | Written in | Next touched by          |
| --------------------- | -------- | ---------- | ------------------------ |
| `scripts/rehearse.ts` | added    | step 12    | each new feature you add |
| `package.json`        | modified | step 12    | never                    |

The scratch project lives in the system temp directory and is never committed.
Add nothing to `.gitignore` for it.

`scripts/rehearse.ts` is given in full in step 12 and is not repeated here.

---

### `package.json` — the added script

```json
{
	"scripts": {
		"dev": "bun run --filter '@anti049/lunar-ui-docs' dev",
		"build": "bun run --filter '*' build",
		"build:packages": "bun run --filter '@anti049/lunar-ui' --filter '@anti049/lunar-ui-svelte' --filter '@anti049/lunar-ui-react' --filter '@anti049/lunar-ui-vue' build",
		"check": "bun run --filter '*' check",
		"rehearse": "bun scripts/rehearse.ts",
		"lint": "prettier --check . && eslint .",
		"format": "prettier --write .",
		"changeset": "changeset",
		"release": "bun run build:packages && changeset publish",
		"prepare": "husky"
	}
}
```

---

## Traps

> **A `workspace:` range survives the pack.** Your bindings declare
> `"@anti049/lunar-ui": "workspace:^"` in `peerDependencies`.
> `changeset publish` rewrites that to a real range during a publish, but
> `npm pack` on its own does not reliably do so — so the tarball you are testing
> can carry a protocol npm cannot install.
>
> **How to tell:** `bun add ./thing.tgz` fails with
> `Unsupported URL Type "workspace:"`, naming neither your package nor which
> field it came from.
>
> **Fix:** step 12's script checks for it explicitly. To get past it by hand,
> extract the tarball, edit the range, and repack — but do not "fix" it by
> hard-coding a version in the source manifest, or `changeset publish` will stop
> managing it.

> **You test with `bun link` because it is faster.** It is, and it proves
> nothing: a link resolves to the working tree, so `files`, `exports` and the
> contents of `dist/` are all bypassed. Every packaging bug this guide exists to
> catch is invisible under a link.

> **You repack without bumping the version.** The package manager serves the
> cached tarball for that name and version, so your fix is not installed and the
> symptom is unchanged behaviour. Looks like the fix did not work.
>
> **Fix:** `npm version prerelease --preid=local --no-git-tag-version` before
> each repack, and reset before committing.

> **You run the scratch app inside the monorepo.** Bun resolves `@anti049/*` to
> the workspace symlinks and the whole exercise is meaningless — it will pass
> even with an empty `dist/`.
>
> **How to tell:** `Get-ChildItem node_modules/@anti049` shows `SymbolicLink`
> rather than a real directory.

> **`npm install` appears to hang.** Two causes, and neither is npm. Either you
> scaffolded a full application for the scratch consumer — `sv create` pulls in
> the whole SvelteKit toolchain, which none of the mechanical checks use — or
> you ran `npm install` over a directory where `bun add` had already failed,
> leaving a `bun.lock` and a partial `node_modules` for npm to re-resolve from.
>
> **How to tell:** a bare manifest plus `tailwindcss` and `@tailwindcss/cli`
> installs in about five seconds, and the four tarballs in about ten. Anything
> beyond that is one of the two above.
>
> **Fix:** delete the directory, start from a bare `package.json`, and pass
> `--no-audit --no-fund`.

> **`bun add ./thing.tgz` fails with a 404 for a package you just installed.**
> Bun resolves `peerDependencies` against the registry even when a matching
> version is already present from a tarball — and a packed tarball has no
> registry identity, so `@anti049/lunar-ui@^0.0.0` goes to npmjs.org and is
> not there.
>
> **How to tell:** `error: GET https://registry.npmjs.org/@anti049%2flunar-ui
>
> - 404`, naming a package that is sitting in `node_modules`. Installing all
the tarballs in one command does not help, and neither does `--omit=peer`,
>   which still exits 1.
>
> **Fix:** install the scratch consumer with `npm`. It resolves the same
> tarballs correctly, and it is the resolver most of your consumers use anyway.
> This affects the rehearsal only — the monorepo itself is fine on Bun, because
> workspace packages resolve by link rather than by range.

> **You check the theme catalogue under `bun`.** `/themes` is the data-only
> entry point whose whole purpose is having no runtime dependencies. Bun
> resolves malformed ESM that Node refuses, so testing it under Bun passes while
> a consumer's SSR build fails.
>
> **Fix:** `node --input-type=module -e "import('…/themes')"`, as step 8 does.

---

## Commit

```powershell
bun run rehearse
git add -A
git commit -m "test(repo): add a pre-publish rehearsal against packed tarballs"
```

Label the PR `skip-changeset` — this ships nothing to a consumer.

---

## Checkpoint

The rehearsal is itself the outside-the-repository test. What is left to check
is that it can **fail**: a rehearsal that passes on a broken package is worse
than none, because it is the last gate before npm.

**Skeleton:** a clone in `$env:TEMP\test-checkpoint\17`, where each packaging
bug is planted in turn. Run from the repository root:

```powershell
$cp = "$env:TEMP\test-checkpoint\17"
Remove-Item -Recurse -Force $cp -ErrorAction SilentlyContinue
git clone --quiet . $cp
Push-Location $cp
bun install --frozen-lockfile
bun run rehearse                                  # passes before anything is planted
```

Plant each of these, run `bun run rehearse`, then `git checkout -- .` before
the next:

| Plant                                                                       | `rehearse` must fail on                          |
| --------------------------------------------------------------------------- | ------------------------------------------------ |
| `"@anti049/test": "workspace:^"` in the Svelte package's `peerDependencies` | the install: `Unsupported URL Type "workspace:"` |
| remove `"./themes"` from the plugin's `exports`                             | the catalogue import                             |
| `"files": ["README.md"]` in the React package                               | the binding import                               |

A rehearsal only covers what it asserts. When you add a feature, add both its
input to `scripts/rehearse.ts` and an assertion on the output — an input with
no assertion passes whatever the package does.

```powershell
Pop-Location
Remove-Item -Recurse -Force $cp
```

Finally, do step 11 — the visual check — at least once against the current
tarballs, and whenever a component's markup has changed. It is the one failure
mode no assertion in this guide can see.

**Passes when** the clean run passes and each planted bug fails the run at the
step named, with a message that says which package and which check.

**If it does not:** a planted bug that passes means the rehearsal has no
assertion for it — add one to `scripts/rehearse.ts` now, while you know exactly
what it needs to catch.

---

Back to the [index](../README.md) · Then [publish](13-release.md)
