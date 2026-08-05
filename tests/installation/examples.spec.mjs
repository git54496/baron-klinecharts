import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const execFileAsync = promisify(execFile);
const vite = resolve('node_modules', '.bin', 'vite');

for (const name of ['vanilla', 'react', 'vue', 'workspace', 'workspace-time-series']) {
	test(`builds the ${name} consumer example`, async () => {
		const output = await mkdtemp(join(tmpdir(), `baron-example-${name}-`));
		await execFileAsync(vite, ['build', resolve('examples', name), '--outDir', output]);
		const html = await readFile(join(output, 'index.html'), 'utf8');
		assert.match(html, /<script type="module"/);
	});
}
