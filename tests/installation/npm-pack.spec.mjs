import assert from 'node:assert/strict';
import { test } from 'node:test';

import { packPublicPackages } from './helpers/pack.mjs';

test('public npm tarballs contain runtime artifacts, declarations, schemas, and licenses', async () => {
	const { packages } = await packPublicPackages();
	for (const packed of packages) {
		const paths = new Set(packed.metadata.files.map((file) => file.path));
		assert.ok(paths.has('LICENSE'), `${packed.directory} is missing LICENSE`);
		assert.ok(paths.has('NOTICE'), `${packed.directory} is missing NOTICE`);
		assert.ok(paths.has('README.md'), `${packed.directory} is missing README.md`);
		assert.ok(
			[...paths].some((path) => path.startsWith('licenses/')),
			`${packed.directory} is missing third-party licenses`,
		);
		assert.ok(
			[...paths].some((path) => path.startsWith('dist/') && path.endsWith('.js')),
			`${packed.directory} is missing built JavaScript`,
		);
		assert.ok(
			[...paths].some((path) => path.startsWith('dist/') && path.endsWith('.d.ts')),
			`${packed.directory} is missing declarations`,
		);
		assert.ok(
			![...paths].some((path) =>
				path.startsWith('src/') ||
				path.startsWith('test/') ||
				path.startsWith('tests/')
			),
			`${packed.directory} exposes source or test files`,
		);
		assert.ok(!paths.has('package-lock.json'));
		if (packed.directory.endsWith('scene-schema')) {
			assert.ok(paths.has('schema/chart-scene.schema.json'));
		}
	}
});
