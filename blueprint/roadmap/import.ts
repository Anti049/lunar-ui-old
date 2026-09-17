/*
	Imports milestones, labels and issues into a GitHub repository.

	    gh auth login
	    bun blueprint/roadmap/import.ts --repo acme/project-name --dry-run
	    bun blueprint/roadmap/import.ts --repo acme/project-name

	Idempotent: milestones and labels are matched by name and skipped if present,
	and an issue with an identical title is not created twice. Safe to re-run
	after adding to the JSON.
*/
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

interface Milestone {
	title: string;
	description: string;
	state: string;
}
interface Issue {
	title: string;
	milestone: string;
	labels: string[];
	body: string;
}

const args = process.argv.slice(2);
const repo = args[args.indexOf('--repo') + 1];
const dryRun = args.includes('--dry-run');

if (!repo || repo.startsWith('--')) {
	console.error('usage: bun import.ts --repo <owner/name> [--dry-run]');
	process.exit(1);
}

const here = import.meta.dirname;
const milestones: Milestone[] = JSON.parse(
	fs.readFileSync(path.join(here, 'milestones.json'), 'utf8')
);
const issues: Issue[] = JSON.parse(fs.readFileSync(path.join(here, 'issues.json'), 'utf8'));

/** Colour and description per label prefix, so the board reads at a glance. */
const LABEL_STYLE: Record<string, { color: string; description: string }> = {
	'area:repo': { color: 'ededed', description: 'Tooling, CI, repository-wide' },
	'area:core': { color: '1d76db', description: 'The Tailwind plugin' },
	'area:svelte': { color: 'ff3e00', description: 'Svelte bindings' },
	'area:react': { color: '61dafb', description: 'React bindings' },
	'area:vue': { color: '42b883', description: 'Vue bindings' },
	'area:docs': { color: '0e8a16', description: 'Documentation site' },
	'area:ci': { color: '5319e7', description: 'Workflows and automation' },
	'type:feat': { color: 'a2eeef', description: 'New capability' },
	'type:fix': { color: 'd73a4a', description: 'Bug fix' },
	'type:chore': { color: 'fef2c0', description: 'Maintenance' },
	'type:docs': { color: '0075ca', description: 'Documentation' },
	'type:test': { color: 'bfd4f2', description: 'Tests' },
	'type:a11y': { color: '7057ff', description: 'Accessibility' },
	'priority:high': { color: 'b60205', description: 'Do this next' },
	component: { color: 'c5def5', description: 'A component' },
	'good first issue': { color: '7057ff', description: 'Good for newcomers' }
};

const gh = (gargs: string[]): string =>
	execFileSync('gh', gargs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const say = (action: string, what: string): void =>
	console.log(`${dryRun ? '[dry-run] ' : ''}${action} ${what}`);

// ---- labels ---------------------------------------------------------------

const wanted = [...new Set(issues.flatMap((i) => i.labels))].sort();
const existingLabels = new Set(
	JSON.parse(gh(['label', 'list', '--repo', repo, '--limit', '200', '--json', 'name'])).map(
		(l: { name: string }) => l.name
	)
);

for (const label of wanted) {
	if (existingLabels.has(label)) {
		say('skip label', label);
		continue;
	}
	const style = LABEL_STYLE[label] ?? { color: 'cccccc', description: '' };
	say('create label', label);
	if (dryRun) continue;
	gh([
		'label',
		'create',
		label,
		'--repo',
		repo,
		'--color',
		style.color,
		'--description',
		style.description
	]);
}

// ---- milestones -----------------------------------------------------------
// `gh` has no milestone command, so these go through the REST API.

const existingMilestones = new Map<string, number>(
	JSON.parse(gh(['api', `repos/${repo}/milestones?state=all&per_page=100`])).map(
		(m: { title: string; number: number }) => [m.title, m.number]
	)
);

for (const milestone of milestones) {
	if (existingMilestones.has(milestone.title)) {
		say('skip milestone', milestone.title);
		continue;
	}
	say('create milestone', milestone.title);
	if (dryRun) continue;
	const created = JSON.parse(
		gh([
			'api',
			`repos/${repo}/milestones`,
			'-f',
			`title=${milestone.title}`,
			'-f',
			`description=${milestone.description}`,
			'-f',
			`state=${milestone.state}`
		])
	);
	existingMilestones.set(milestone.title, created.number);
}

// ---- issues ---------------------------------------------------------------

const existingIssues = new Set(
	JSON.parse(
		gh(['issue', 'list', '--repo', repo, '--state', 'all', '--limit', '500', '--json', 'title'])
	).map((i: { title: string }) => i.title)
);

let created = 0;
for (const issue of issues) {
	if (existingIssues.has(issue.title)) {
		say('skip issue', issue.title);
		continue;
	}
	say('create issue', issue.title);
	if (dryRun) continue;
	gh([
		'issue',
		'create',
		'--repo',
		repo,
		'--title',
		issue.title,
		'--body',
		issue.body,
		'--milestone',
		issue.milestone,
		...issue.labels.flatMap((l) => ['--label', l])
	]);
	created += 1;
}

console.log(
	`\n${dryRun ? 'Would create' : 'Created'} ${dryRun ? issues.filter((i) => !existingIssues.has(i.title)).length : created} issue(s) in ${repo}.`
);
