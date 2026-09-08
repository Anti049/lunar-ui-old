import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const svelteLibEntry = fileURLToPath(
	new URL('../svelte/src/lib/index.ts', import.meta.url)
);

export default defineConfig({
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
		})
	],

	resolve: {
		alias: {
			// Consume the component library from source during development so edits
			// hot-reload without a `svelte-package` rebuild. Published consumers
			// resolve the same specifier to `dist/` via the package exports map.
			'@anti049/lunar-ui-svelte': svelteLibEntry
		}
	},

	server: {
		fs: {
			// Allow serving files from sibling workspace packages.
			allow: [repoRoot]
		}
	}
});
