import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseDrawableWorkspaceDocument } from '@baron1996/kline-scene-schema';

import {
	buildDrawableWorkspaceStandaloneHtml,
} from '../src/drawable-workspace-html.js';
import { buildStandaloneHtml } from '../src/html.js';
import { loadScene } from './load-scene.js';

async function loadWorkspace(kind: 'chart' | 'time-series') {
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

function decodeInjectedDocument(
	html: string,
	marker: string,
): Record<string, unknown> {
	const matches = html.match(/[A-Za-z0-9+/=]{200,}/g);
	const encoded = matches?.find((candidate) => {
		try {
			const decoded = Buffer.from(candidate, 'base64').toString('utf8');
			return decoded.includes(marker);
		} catch {
			return false;
		}
	});
	if (encoded === undefined) {
		throw new Error('Injected DrawableWorkspace bytes were not found.');
	}
	return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
}

describe('DrawableWorkspace standalone HTML', () => {
	it('embeds a canonical Workspace into the single-placeholder template', async () => {
		const workspace = await loadWorkspace('chart');
		const html = buildDrawableWorkspaceStandaloneHtml(workspace);
		const injected = decodeInjectedDocument(
			html,
			'@baron1996/drawable-workspace',
		);
		expect(injected.schema).toBe('@baron1996/drawable-workspace');
		const parsed = parseDrawableWorkspaceDocument(injected);
		expect(parsed.drawings.drawings).toHaveLength(22);
	});

	it('embeds a time-series Workspace with the same template', async () => {
		const workspace = await loadWorkspace('time-series');
		const html = buildDrawableWorkspaceStandaloneHtml(workspace);
		const injected = decodeInjectedDocument(
			html,
			'@baron1996/drawable-workspace',
		);
		expect(injected.scene.kind).toBe('time-series');
	});

	it('keeps legacy Scene HTML generation unchanged', async () => {
		const scene = loadScene('minimal-valid.json');
		const legacy = buildStandaloneHtml(scene);
		expect(legacy).toContain('__BARON_KLINE_SCENE__');
		// 离线 Runtime 模板是唯一产物，同时包含新旧两个桥的实现；桥的隔离由
		// 浏览器入口按注入文档 schema 显式分支决定，不在模板字符串层面区分。
		const injected = decodeInjectedDocument(legacy, '@baron1996/kline-scene');
		expect(injected.schema).toBe('@baron1996/kline-scene');
	});
});
