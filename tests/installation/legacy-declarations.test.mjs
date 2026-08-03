import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const legacyDeclarationHashes = new Map([
	['packages/scene-schema/dist/errors.d.ts', '102e0124ea9e8d45d71dbec07f55cada70f63842b23cd7e339f2eabf89569151'],
	['packages/scene-schema/dist/generated/chart-scene.d.ts', '9aa338133f3acd8685ca32e5163235fb86aec4328412d2f0709dbddc052f14d7'],
	['packages/scene-schema/dist/validator.d.ts', 'ba77dc8b426bd71317e462109894e6202a7952a560b80e37e688567760e80ec6'],
	['packages/web-runtime/dist/types.d.ts', '27948cbd9292817fb1e8193563fd678547ec93f612b40bff586e1edcee49f56e'],
	['packages/web-runtime/dist/runtime.d.ts', '2423081ee548154474868b211029be27e69f711d512d8e7f04c6d17496c31c24'],
]);

test('legacy schema errors and Runtime declarations remain byte-for-byte compatible', async () => {
	for (const [path, expectedHash] of legacyDeclarationHashes) {
		const content = await readFile(path);
		const actualHash = createHash('sha256').update(content).digest('hex');
		assert.equal(actualHash, expectedHash, `${path} changed unexpectedly`);
	}
});
