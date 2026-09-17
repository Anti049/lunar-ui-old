#!/usr/bin/env bun
/*
  Import the roadmap into a GitHub repository: labels, milestones, then issues.

  Usage:
    gh auth login                          # authenticate the GitHub CLI once
    export GH_REPO=your-org/project-name   # target "owner/repo"
    bun handbook/roadmap/import.ts         # dry run is off; creates real data

  Requirements:
    - GitHub CLI (`gh`) installed and authenticated with `repo` scope.
    - Run against a FRESH repository: issues are not de-duplicated, so running
      twice creates duplicate issues. Labels and milestones are skipped if they
      already exist.

  Flags:
    --dry-run    Print what would be created without calling the API.
*/

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = process.env.GH_REPO;
const dryRun = process.argv.includes('--dry-run');

if (!repo) {
	console.error('Set GH_REPO to "owner/repo", e.g. export GH_REPO=your-org/project-name');
	process.exit(1);
}

interface Label {
	name: string;
	color: string;
	description: string;
}
interface Milestone {
	title: string;
	state: string;
	description: string;
}
interface Issue {
	title: string;
	milestone: string;
	labels: string[];
	body: string;
}

const { labels, issues } = JSON.parse(readFileSync(path.join(here, 'issues.json'), 'utf8')) as {
	labels: Label[];
	issues: Issue[];
};
const { milestones } = JSON.parse(readFileSync(path.join(here, 'milestones.json'), 'utf8')) as {
	milestones: Milestone[];
};

/** Run `gh` and return stdout; respects --dry-run. */
function gh(args: string[]): string {
	if (dryRun) {
		console.log('[dry-run] gh', args.join(' '));
		return '';
	}
	return execFileSync('gh', args, { encoding: 'utf8' });
}

/** Call the GitHub REST API through `gh api`. */
function api(args: string[]): string {
	return gh(['api', ...args]);
}

function createLabels(): void {
	console.log(`\nLabels (${labels.length})`);
	for (const l of labels) {
		try {
			gh([
				'label',
				'create',
				l.name,
				'--repo',
				repo!,
				'--color',
				l.color,
				'--description',
				l.description,
				'--force'
			]);
			console.log(`  + ${l.name}`);
		} catch {
			console.log(`  = ${l.name} (exists)`);
		}
	}
}

/** Create milestones and return a title -> number map for issue assignment. */
function createMilestones(): Map<string, number> {
	console.log(`\nMilestones (${milestones.length})`);
	const map = new Map<string, number>();

	// Read existing milestones first so we can reuse their numbers.
	if (!dryRun) {
		const existing = JSON.parse(
			api(['-X', 'GET', `repos/${repo}/milestones`, '-f', 'state=all']) || '[]'
		) as Array<{ title: string; number: number }>;
		for (const m of existing) map.set(m.title, m.number);
	}

	for (const m of milestones) {
		if (map.has(m.title)) {
			console.log(`  = ${m.title} (exists)`);
			continue;
		}
		const out = api([
			'-X',
			'POST',
			`repos/${repo}/milestones`,
			'-f',
			`title=${m.title}`,
			'-f',
			`state=${m.state}`,
			'-f',
			`description=${m.description}`
		]);
		if (!dryRun) {
			const created = JSON.parse(out) as { number: number };
			map.set(m.title, created.number);
		}
		console.log(`  + ${m.title}`);
	}
	return map;
}

function createIssues(milestoneNumbers: Map<string, number>): void {
	console.log(`\nIssues (${issues.length})`);
	for (const issue of issues) {
		const number = milestoneNumbers.get(issue.milestone);
		const args = [
			'issue',
			'create',
			'--repo',
			repo!,
			'--title',
			issue.title,
			'--body',
			issue.body,
			'--label',
			issue.labels.join(',')
		];
		// `gh issue create` accepts a milestone by title.
		if (number !== undefined || dryRun) args.push('--milestone', issue.milestone);
		gh(args);
		console.log(`  + ${issue.title}  [${issue.milestone}]`);
	}
}

console.log(`Importing roadmap into ${repo}${dryRun ? ' (dry run)' : ''}`);
createLabels();
const milestoneNumbers = createMilestones();
createIssues(milestoneNumbers);
console.log('\nDone.');
