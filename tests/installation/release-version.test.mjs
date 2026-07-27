import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { checkReleaseVersion } from '../../tools/release/check-release-version.mjs';

const workspacePaths = [
	'packages/scene-schema',
	'packages/klinecharts-adapter',
	'packages/web-runtime',
	'packages/render-runtime',
	'packages/cli',
];

async function createRepository({
	rootVersion = '0.1.0',
	workspaceVersion = '0.1.0',
	pythonVersion = '0.1.0',
} = {}) {
	const root = await mkdtemp(join(tmpdir(), 'baron-release-version-'));
	await writeFile(
		join(root, 'package.json'),
		JSON.stringify({ version: rootVersion }),
	);
	for (const workspace of workspacePaths) {
		const directory = join(root, workspace);
		await mkdir(directory, { recursive: true });
		await writeFile(
			join(directory, 'package.json'),
			JSON.stringify({ version: workspaceVersion }),
		);
	}
	const pythonDirectory = join(root, 'python', 'baron-klinecharts');
	await mkdir(pythonDirectory, { recursive: true });
	await writeFile(
		join(pythonDirectory, 'pyproject.toml'),
		`[project]\nname = "baron-klinecharts"\nversion = "${pythonVersion}"\n`,
	);
	return root;
}

test('accepts an exact stable tag matching every release manifest', async () => {
	const root = await createRepository();
	assert.equal(await checkReleaseVersion({ root, tag: 'v0.1.0' }), '0.1.0');
});

test('rejects a tag without the required v prefix', async () => {
	const root = await createRepository();
	await assert.rejects(
		checkReleaseVersion({ root, tag: '0.1.0' }),
		/invalid stable release tag/u,
	);
});

test('rejects a tag that differs from the root package', async () => {
	const root = await createRepository();
	await assert.rejects(
		checkReleaseVersion({ root, tag: 'v0.2.0' }),
		/package\.json declares 0\.1\.0/u,
	);
});

test('rejects a workspace with a different version', async () => {
	const root = await createRepository({ workspaceVersion: '0.1.1' });
	await assert.rejects(
		checkReleaseVersion({ root, tag: 'v0.1.0' }),
		/packages\/scene-schema\/package\.json declares 0\.1\.1/u,
	);
});

test('rejects a Python project with a different version', async () => {
	const root = await createRepository({ pythonVersion: '0.1.1' });
	await assert.rejects(
		checkReleaseVersion({ root, tag: 'v0.1.0' }),
		/pyproject\.toml declares 0\.1\.1/u,
	);
});

test('rejects missing tag input', async () => {
	const root = await createRepository();
	await assert.rejects(
		checkReleaseVersion({ root, tag: '' }),
		/release tag is required/u,
	);
});
