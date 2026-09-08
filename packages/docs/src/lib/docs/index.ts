/*
	Component documentation registry.

	Eagerly loads every `./components/*.json` doc at build time and keys them by
	file name (the component slug). Pages read docs with `getComponentDoc(slug)`
	instead of hand-writing class tables inline.
*/

import type { ComponentDoc } from './types';

export type { ComponentClass, ComponentClassType, ComponentDoc } from './types';

const modules = import.meta.glob<ComponentDoc>('./components/*.json', {
	eager: true,
	import: 'default'
});

/** All component docs, keyed by slug (e.g. `tooltip`). */
export const componentDocs: Record<string, ComponentDoc> = Object.fromEntries(
	Object.entries(modules).map(([path, doc]) => {
		const slug = path.replace(/^.*\/(.+)\.json$/, '$1');
		return [slug, doc];
	})
);

/** Look up a component doc by slug. Returns `undefined` when none exists. */
export function getComponentDoc(slug: string): ComponentDoc | undefined {
	return componentDocs[slug];
}
