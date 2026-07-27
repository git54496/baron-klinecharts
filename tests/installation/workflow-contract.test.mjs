import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('verification workflow targets the clean main branch', async () => {
	const workflow = await readFile('.github/workflows/verify.yml', 'utf8');
	assert.match(workflow, /^\s*pull_request:\s*$/mu);
	assert.match(workflow, /^\s*-\s+main\s*$/mu);
	assert.doesNotMatch(workflow, /^\s*-\s+master\s*$/mu);
});

test('release workflow is a build-once protected registry publication', async () => {
	const workflow = await readFile('.github/workflows/release.yml', 'utf8');
	assert.match(workflow, /^\s*release:\s*$/mu);
	assert.match(workflow, /^\s*types:\s*\[published\]\s*$/mu);
	assert.doesNotMatch(workflow, /workflow_dispatch/u);
	assert.match(workflow, /concurrency:/u);
	assert.match(workflow, /cancel-in-progress:\s*false/u);

	const versionCheck = workflow.indexOf('release:check-version');
	const fullVerification = workflow.indexOf('npm run verify');
	assert.ok(versionCheck >= 0);
	assert.ok(fullVerification > versionCheck);
	assert.equal((workflow.match(/release:build-npm/gu) ?? []).length, 1);
	assert.equal((workflow.match(/python -m build/gu) ?? []).length, 1);
	assert.match(workflow, /actions\/upload-artifact@v4/u);
	assert.ok((workflow.match(/actions\/download-artifact@v4/gu) ?? []).length >= 3);

	assert.equal((workflow.match(/environment:\s*release/gu) ?? []).length, 2);
	assert.equal((workflow.match(/id-token:\s*write/gu) ?? []).length, 2);
	assert.match(workflow, /secrets\.NPM_TOKEN/u);
	assert.equal((workflow.match(/secrets\.NPM_TOKEN/gu) ?? []).length, 1);
	assert.match(workflow, /npm publish/u);
	assert.match(workflow, /--access public/u);
	assert.match(workflow, /--provenance/u);

	assert.match(workflow, /pypa\/gh-action-pypi-publish@release\/v1/u);
	assert.doesNotMatch(workflow, /PYPI_TOKEN/u);
	assert.doesNotMatch(workflow, /^\s*(username|password):/gmu);
	assert.match(workflow, /gh release upload/u);
	assert.match(workflow, /contents:\s*write/u);
});
