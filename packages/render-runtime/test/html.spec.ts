import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { serializeCanonicalScene } from '@baron1996/kline-scene-schema';

import {
	SCENE_BASE64_PLACEHOLDER,
	STANDALONE_HTML_SHA256,
	STANDALONE_HTML_TEMPLATE,
} from '../src/assets.generated.js';
import { buildStandaloneHtml } from '../src/html.js';
import { loadScene } from './load-scene.js';

const minimalScene = loadScene('minimal-valid.json');

describe('self-contained standalone HTML', () => {
	it('contains one Scene placeholder and fixed Runtime identity metadata', () => {
		expect(STANDALONE_HTML_TEMPLATE.split(SCENE_BASE64_PLACEHOLDER)).toHaveLength(2);
		expect(STANDALONE_HTML_TEMPLATE).toContain(
			'<meta name="baron-runtime-version" content="0.1.0">',
		);
		expect(STANDALONE_HTML_TEMPLATE).toContain(
			'<meta name="baron-klinecharts-version" content="10.0.0">',
		);
		expect(STANDALONE_HTML_TEMPLATE).toContain('data:font/woff2;base64,');
		expect(STANDALONE_HTML_TEMPLATE).toContain('"Baron Sans"');
	});

	it('contains no external executable/resource references or network API calls', () => {
		expect(STANDALONE_HTML_TEMPLATE).not.toMatch(
			/<(?:script|link|img|source|video|audio)\b[^>]*(?:src|href)=["'](?!data:|#)/iu,
		);
		expect(STANDALONE_HTML_TEMPLATE).not.toMatch(
			/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/u,
		);
		expect(STANDALONE_HTML_TEMPLATE).not.toMatch(/\bimport\s*\(/u);
		expect(STANDALONE_HTML_TEMPLATE).not.toMatch(
			/@font-face[^}]*url\((?!["']?data:)/isu,
		);
	});

	it('replaces the placeholder with the exact canonical Scene bytes', () => {
		const html = buildStandaloneHtml(minimalScene);
		const [prefix, suffix] = STANDALONE_HTML_TEMPLATE.split(SCENE_BASE64_PLACEHOLDER);
		const encoded = html.slice(prefix!.length, html.length - suffix!.length);
		const decoded = Buffer.from(encoded, 'base64');

		expect(decoded).toEqual(Buffer.from(serializeCanonicalScene(minimalScene)));
		expect(html).not.toContain(SCENE_BASE64_PLACEHOLDER);
	});

	it('is deterministic and permits inert URL text inside Scene metadata', () => {
		const scene = structuredClone(minimalScene);
		scene.metadata = { attribution: 'https://example.invalid/license' };

		expect(buildStandaloneHtml(scene)).toBe(buildStandaloneHtml(structuredClone(scene)));
	});

	it('records the generated template digest', () => {
		expect(createHash('sha256').update(STANDALONE_HTML_TEMPLATE).digest('hex')).toBe(
			STANDALONE_HTML_SHA256,
		);
	});
});
