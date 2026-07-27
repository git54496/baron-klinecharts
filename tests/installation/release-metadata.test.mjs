import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const repositoryUrl =
	'git+https://github.com/git54496/baron-klinecharts.git';
const releaseVersion = '0.1.0';

const npmManifests = [
	{
		path: 'package.json',
		name: '@baron1996/klinecharts-scene-workspace',
		directory: undefined,
		public: false,
	},
	{
		path: 'packages/scene-schema/package.json',
		name: '@baron1996/kline-scene-schema',
		directory: 'packages/scene-schema',
		public: true,
	},
	{
		path: 'packages/klinecharts-adapter/package.json',
		name: '@baron1996/klinecharts-adapter',
		directory: 'packages/klinecharts-adapter',
		public: true,
	},
	{
		path: 'packages/web-runtime/package.json',
		name: '@baron1996/klinecharts-runtime',
		directory: 'packages/web-runtime',
		public: true,
	},
	{
		path: 'packages/render-runtime/package.json',
		name: '@baron1996/klinecharts-render-runtime',
		directory: 'packages/render-runtime',
		public: false,
	},
	{
		path: 'packages/cli/package.json',
		name: '@baron1996/klinecharts-cli',
		directory: 'packages/cli',
		public: true,
	},
];

test('npm manifests expose the canonical public release identity', async () => {
	for (const expected of npmManifests) {
		const manifest = JSON.parse(await readFile(expected.path, 'utf8'));
		assert.equal(manifest.name, expected.name, expected.path);
		assert.equal(manifest.version, releaseVersion, expected.path);
		assert.equal(manifest.repository.type, 'git', expected.path);
		assert.equal(manifest.repository.url, repositoryUrl, expected.path);
		assert.equal(
			manifest.repository.directory,
			expected.directory,
			expected.path,
		);

		if (expected.public) {
			assert.notEqual(manifest.private, true, expected.path);
			assert.deepEqual(
				manifest.publishConfig,
				{
					access: 'public',
					registry: 'https://registry.npmjs.org/',
				},
				expected.path,
			);
		} else {
			assert.equal(manifest.private, true, expected.path);
			assert.equal(manifest.publishConfig, undefined, expected.path);
		}
	}
});

test('Python metadata exposes the same release and public repository', async () => {
	const pyproject = await readFile(
		'python/baron-klinecharts/pyproject.toml',
		'utf8',
	);
	assert.match(pyproject, /^version = "0\.1\.0"$/m);
	assert.match(
		pyproject,
		/^Source = "https:\/\/github\.com\/git54496\/baron-klinecharts"$/m,
	);
	assert.match(
		pyproject,
		/^Issues = "https:\/\/github\.com\/git54496\/baron-klinecharts\/issues"$/m,
	);
	assert.match(
		pyproject,
		/^Changelog = "https:\/\/github\.com\/git54496\/baron-klinecharts\/releases"$/m,
	);
});
