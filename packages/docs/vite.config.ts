import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const svelteLibEntry = fileURLToPath(new URL('../svelte/src/lib/index.ts', import.meta.url));
const pluginEntry = fileURLToPath(new URL('../lunar-ui/index.ts', import.meta.url));
const themeEntry = fileURLToPath(new URL('../lunar-ui/theme.ts', import.meta.url));

const appCss = fileURLToPath(new URL('./src/app.css', import.meta.url));

const pluginWatcher = fileURLToPath(new URL('../lunar-ui/functions/watch.ts', import.meta.url));

/*
	Live CSS from the plugin, in dev.

	The design system is compiled from CSS into `generated/`, so editing
	`packages/lunar-ui/src/**` changes nothing a dev server can see -- which is
	why the edit-refresh loop stopped working when the package went plugin-only.
	Two things have to happen, and neither does on its own:

	 1. Rebuild `generated/`. Delegated to the plugin's own watcher so the build
	    logic has one home; it touches `index.ts` when it succeeds.
	 2. Get Tailwind to notice. Its Vite plugin does track the `@plugin` file's
	    mtime, but only re-checks from inside its CSS `transform`, and its
	    hot-update hook deliberately ignores `.ts`/`.js` files -- so nothing ever
	    re-runs that transform. Bumping app.css's mtime here is what does.

	Running the watcher as a child rather than a second workspace script is
	deliberate: `bun run --filter` orders by workspace dependency, and docs
	depends on the plugin, so a long-lived watcher there would block the dev
	server from ever starting.
*/
function lunarUiReload(entry: string): Plugin {
	return {
		name: 'lunar-ui:reload',
		apply: 'serve',
		configureServer(server) {
			const watcher = spawn('bun', [pluginWatcher], {
				stdio: ['ignore', 'inherit', 'inherit'],
				shell: process.platform === 'win32'
			});
			const stop = (): void => {
				watcher.kill();
			};
			server.httpServer?.on('close', stop);
			process.on('exit', stop);

			server.watcher.add(entry);
			server.watcher.on('change', (file) => {
				if (path.resolve(file) !== path.resolve(entry)) return;
				/*
					Bump app.css's mtime, which is what actually re-runs Tailwind's
					transform -- the only place the `@plugin` mtime is re-checked.

					The two lighter-looking options do not work, both verified:
					invalidating the module by hand still serves the cached `?direct`
					response, and emitting a synthetic watcher event runs HMR but not
					a fresh transform. Only a real mtime change does both.

					Content is untouched, so this is invisible to git, and it cannot
					loop: the handler above only reacts to the plugin entry.
				*/
				const now = new Date();
				fs.utimesSync(appCss, now, now);
			});
		}
	};
}

export default defineConfig(({ command }) => ({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for first-party code. Workspace packages resolve to
				// real paths under packages/, not node_modules, so they are covered too
				// (they are runes-only by design). Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
			// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
			// See https://svelte.dev/docs/kit/adapters for more information about adapters.
			adapter: adapter()
		}),
		...(command === 'serve' ? [lunarUiReload(pluginEntry)] : [])
	],

	resolve: {
		/*
			Array form, with anchored patterns, rather than the object form.

			An object alias matches by prefix, so `'@anti049/lunar-ui'` also caught
			`@anti049/lunar-ui/theme` and rewrote it to `index.ts/theme`, which does
			not exist -- every subpath export silently broke. Anchoring each pattern
			means a new subpath fails loudly at resolve time instead.
		*/
		alias: [
			// Consume the component library from source during development so edits
			// hot-reload without a `svelte-package` rebuild. Published consumers
			// resolve the same specifier to `dist/` via the package exports map.
			{ find: /^@anti049\/lunar-ui-svelte$/, replacement: svelteLibEntry },

			/*
				Same idea for the Tailwind plugin, but only while serving.

				`@plugin '@anti049/lunar-ui'` in app.css normally resolves through
				the exports map to `dist/index.js`, so a CSS edit would need a full
				`build` -- including `tsc` -- before the browser saw it. Tailwind
				loads an `@plugin` through jiti, which reads TypeScript directly, so
				pointing at the entry source lets `bun run dev` skip `tsc` and
				rebuild only `generated/`.

				Builds keep resolving to `dist/`, so what the docs are built against
				is what consumers install. Every subpath the package exports needs a
				line here, or it resolves to `dist/` while the root resolves to
				source -- two copies of the plugin in one compile.
			*/
			...(command === 'serve'
				? [
						{ find: /^@anti049\/lunar-ui$/, replacement: pluginEntry },
						{ find: /^@anti049\/lunar-ui\/theme$/, replacement: themeEntry }
					]
				: [])
		]
	},

	/*
		material-color-utilities ships extensionless internal imports
		(`../dynamiccolor/dynamic_scheme`, no `.js`), which Node's ESM resolver
		rejects outright. Bun and jiti tolerate it, so the plugin build and the
		unit tests never see it -- but Vite's SSR runs under Node, so the theme
		generator page died with ERR_MODULE_NOT_FOUND. Letting Vite bundle it
		instead of externalising it puts the resolution through Vite, which fills
		the extension in.
	*/
	ssr: {
		noExternal: ['@material/material-color-utilities']
	},

	server: {
		fs: {
			// Allow serving files from sibling workspace packages.
			allow: [repoRoot]
		}
	}
}));
