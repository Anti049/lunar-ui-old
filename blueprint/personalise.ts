/*
	Substitutes the blueprint's placeholders for your real names, in place.

	    bun blueprint/personalise.ts --scope @moonlight --name moonlight --owner nploetz049

	Markdown has no variables, so this is the substitute: run it once, before you
	start, and every command in every guide becomes copy-pasteable with no mental
	translation. Guide 0 has the table of what each placeholder means.

	It rewrites files IN PLACE and is not reversible. Commit first, or run it on
	a copy — it refuses to run on a dirty tree unless you pass --force.
*/
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const blueprintDir = import.meta.dirname;

/** Files worth rewriting. Everything else in here is binary or generated. */
const EXTENSIONS = new Set(['.md', '.json', '.ts']);

interface Names {
	scope: string;
	name: string;
	owner: string;
	holder: string;
}

function parseArgs(argv: string[]): { names: Names; force: boolean; dryRun: boolean } {
	const get = (flag: string): string | undefined => {
		const at = argv.indexOf(flag);
		return at === -1 ? undefined : argv[at + 1];
	};

	const scope = get('--scope');
	const name = get('--name');
	const owner = get('--owner');

	if (!scope || !name || !owner) {
		console.error(
			`Usage: bun blueprint/personalise.ts --scope @acme --name moonlight --owner acme\n` +
				`\n` +
				`  --scope   npm scope, with the leading @        e.g. @moonlight-ui\n` +
				`  --name    package and repository name          e.g. moonlight\n` +
				`  --owner   GitHub user or organisation          e.g. nploetz049\n` +
				`  --holder  copyright holder for LICENSE         defaults to --owner\n` +
				`  --dry-run show what would change, write nothing\n` +
				`  --force   run even with uncommitted changes\n`
		);
		process.exit(1);
	}

	if (!scope.startsWith('@')) {
		throw new Error(`--scope must start with @ — got "${scope}".`);
	}
	/*
		npm package names are lowercase, and the name is concatenated into
		`<name>-svelte` and used as a directory. Anything else produces a package
		that cannot be published, several steps after the mistake.
	*/
	if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
		throw new Error(`--name must be lowercase letters, digits and hyphens — got "${name}".`);
	}

	return {
		names: { scope, name, owner, holder: get('--holder') ?? owner },
		force: argv.includes('--force'),
		dryRun: argv.includes('--dry-run')
	};
}

/**
 * Replaces every placeholder in ONE pass.
 *
 * A pass per placeholder would re-scan its own output: with `--scope @acme` and
 * `--owner acme`, replacing `@scope` first and then `acme` would rewrite the
 * scope a second time. One alternation, longest first, cannot do that.
 */
function substitute(text: string, names: Names): string {
	const map: Record<string, string> = {
		'@scope': names.scope,
		'project-name': names.name,
		acme: names.owner,
		'Your Name': names.holder
	};

	// Longest first, so `project-name` wins over any shorter overlap.
	const pattern = new RegExp(
		Object.keys(map)
			.sort((a, b) => b.length - a.length)
			.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
			.join('|'),
		'g'
	);

	return text.replace(pattern, (found) => map[found]);
}

function walk(dir: string, into: string[] = []): string[] {
	for (const entry of fs
		.readdirSync(dir, { withFileTypes: true })
		.sort((a, b) => a.name.localeCompare(b.name))) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === 'node_modules' || entry.name === '.git') continue;
			walk(full, into);
			continue;
		}
		// Do not rewrite this script — its own placeholders are documentation.
		if (full === path.join(blueprintDir, 'personalise.ts')) continue;
		if (EXTENSIONS.has(path.extname(entry.name))) into.push(full);
	}
	return into;
}

const { names, force, dryRun } = parseArgs(process.argv.slice(2));

if (!force && !dryRun) {
	/*
		This is destructive and there is no undo. A clean tree means `git diff`
		shows exactly what changed, and `git checkout` puts it back.
	*/
	const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
	if (status) {
		console.error(
			'Working tree is not clean. Commit or stash first, or pass --force.\n' +
				'This rewrites files in place and cannot be undone.'
		);
		process.exit(1);
	}
}

let filesChanged = 0;
let replacements = 0;

for (const file of walk(blueprintDir)) {
	const before = fs.readFileSync(file, 'utf8');
	const after = substitute(before, names);
	if (before === after) continue;

	// Count occurrences for the summary, so a surprising number is visible.
	const delta = before.split(/@scope|project-name|acme|Your Name/).length - 1;
	filesChanged++;
	replacements += delta;

	if (dryRun) {
		console.log(`${path.relative(blueprintDir, file)} — ${delta} replacements`);
		continue;
	}
	fs.writeFileSync(file, after);
}

console.log(
	`\n${dryRun ? 'Would rewrite' : 'Rewrote'} ${filesChanged} files, ` +
		`${replacements} replacements.\n` +
		`  scope   ${names.scope}\n` +
		`  name    ${names.name}\n` +
		`  owner   ${names.owner}\n` +
		`  holder  ${names.holder}\n`
);

if (!dryRun) {
	console.log('Check `git diff` before committing. Nothing outside blueprint/ was touched.');
}
