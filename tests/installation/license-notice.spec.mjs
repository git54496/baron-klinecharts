import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('NOTICE retains engine, transitive chart, and embedded font attribution', async () => {
	const notice = await readFile('NOTICE', 'utf8');
	assert.match(notice, /KLineChart/);
	assert.match(notice, /TradingView/);
	assert.match(notice, /Noto Sans SC/);
	assert.match(notice, /Apache License, Version 2\.0/);
	assert.match(notice, /SIL Open Font License, Version 1\.1/);
});

test('all distributable packages contain synchronized legal files', async () => {
	for (const directory of [
		'packages/scene-schema',
		'packages/klinecharts-adapter',
		'packages/web-runtime',
		'packages/render-runtime',
		'packages/cli',
		'python/baron-klinecharts',
	]) {
		assert.equal(
			await readFile(`${directory}/LICENSE`, 'utf8'),
			await readFile('LICENSE', 'utf8'),
		);
		assert.equal(
			await readFile(`${directory}/NOTICE`, 'utf8'),
			await readFile('NOTICE', 'utf8'),
		);
		for (const name of [
			'KLineCharts-LICENSE',
			'KLineCharts-NOTICE',
			'TradingView-Lightweight-Charts-LICENSE',
			'Noto-Sans-SC-OFL-1.1',
		]) {
			await readFile(`${directory}/licenses/${name}`);
		}
	}
});
