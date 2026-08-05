import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function loadWorkspaceFixture(kind: 'chart' | 'time-series') {
	const name = kind === 'chart'
		? 'chart-minimal.json'
		: 'time-series-minimal.json';
	return JSON.parse(
		await readFile(
			join(
				import.meta.dirname,
				'..',
				'..',
				'..',
				'tests',
				'fixtures',
				'workspaces',
				name,
			),
			'utf8',
		),
	);
}
