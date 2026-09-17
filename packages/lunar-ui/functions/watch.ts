import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
	Watch mode for the plugin's CSS.

	The plugin is compiled from CSS, so editing `src/**` changes nothing until
	`build.ts` has run again. That is the whole reason a docs edit-refresh loop
	stopped working when the package went plugin-only: there is no longer a
	stylesheet the dev server can import and hot-reload directly.

	This closes the loop. It rebuilds `generated/` on every change, and the docs
	app aliases `@anti049/lunar-ui` to the TypeScript entry during `vite dev`
	(see packages/docs/vite.config.ts), so nothing has to run `tsc` in between.
	Tailwind's Vite plugin already treats an `@plugin` file as a build
	dependency and recompiles when its mtime moves, so the rebuild alone is
	enough to get new CSS into the browser.

	`tsc` is deliberately not run here: it roughly triples the turnaround and
	only produces `dist/`, which nothing in the dev loop reads. Run
	`bun run build` when you want the published artifact.
*/

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '..');
const buildScript = path.join(here, 'build.ts');

/* Both halves of the input: the CSS itself, and the scripts that compile it. */
const watched = [path.join(pkgRoot, 'src'), here];

const DEBOUNCE_MS = 80;

/*
	The plugin entry. Touched after every successful build.

	A consumer's Tailwind tracks the `@plugin` file it was pointed at and
	recompiles when that file's mtime moves. It does not know about the entry's
	imports, and `generated/` is where a CSS change actually lands -- so without
	this the rebuild is invisible and the browser keeps the old stylesheet.
*/
const entry = path.join(pkgRoot, 'index.ts');

function build(): void {
	const started = Date.now();
	try {
		execFileSync(process.execPath, [buildScript], {
			cwd: pkgRoot,
			stdio: ['ignore', 'ignore', 'pipe']
		});
		const now = new Date();
		fs.utimesSync(entry, now, now);
		console.log(`  rebuilt in ${Date.now() - started}ms`);
	} catch (error) {
		// Keep watching. A syntax error in a stylesheet is a normal thing to
		// hit mid-edit, and exiting would mean restarting the whole dev setup.
		const detail = (error as { stderr?: Buffer }).stderr?.toString().trim();
		console.error(`  build failed:\n${detail || String(error)}`);
	}
}

console.log('lunar-ui: building once before watching ...');
build();

let timer: NodeJS.Timeout | undefined;
const schedule = (file: string): void => {
	if (!/\.(css|ts)$/.test(file)) return;
	clearTimeout(timer);
	// Editors write a file in several operations, and a single save can fire
	// more than one event. Coalesce them so one save is one build.
	timer = setTimeout(() => {
		console.log(`lunar-ui: ${file} changed`);
		build();
	}, DEBOUNCE_MS);
};

for (const dir of watched) {
	fs.watch(dir, { recursive: true }, (_event, filename) => {
		if (filename) schedule(filename.split(path.sep).join('/'));
	});
}

console.log(`lunar-ui: watching ${watched.map((d) => path.relative(pkgRoot, d)).join(', ')}`);
