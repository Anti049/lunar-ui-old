/*
	Component documentation types.

	Single source of truth for the shape of the JSON files in `./components/*.json`.
	The JSON Schema (`component-doc.schema.json`) is kept in sync with these types by
	hand — update both when the shape changes.
*/

export type ComponentClassType =
	'component' | 'part' | 'modifier' | 'direction' | 'placement' | 'style' | 'color' | 'size';

export interface ComponentClass {
	className: string;
	type: ComponentClassType;
	description?: string;
}

export interface ComponentDoc {
	/** Display name, e.g. "Tooltip". */
	name: string;
	/** One-line summary shown under the page title. */
	description: string;
	/** Every utility class the component exposes. */
	classes: ComponentClass[];
}
