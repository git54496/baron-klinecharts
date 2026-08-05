import { describe, expect, it } from 'vitest';

import allDrawings from '../../../tests/fixtures/drawings/all-drawings.json';
import chartMinimal from '../../../tests/fixtures/workspaces/chart-minimal.json';
import {
	hashCanonicalDrawableWorkspace,
	hashCanonicalDrawingDocument,
	parseDrawingDocument,
	serializeCanonicalDrawableWorkspace,
	serializeCanonicalDrawingDocument,
} from '../src/index.js';

function text(bytes: Uint8Array): string {
	return new TextDecoder().decode(bytes);
}

describe('Drawing and Workspace canonical serialization', () => {
	it('serializes stable canonical bytes regardless of key order', () => {
		const shuffled = structuredClone(allDrawings);
		shuffled.metadata = { b: 1, a: 2, nested: { z: true, y: false } };
		const first = text(serializeCanonicalDrawingDocument(shuffled));
		const second = text(serializeCanonicalDrawingDocument(shuffled));
		expect(first).toBe(second);
		expect(first).toContain('"a":2');
		expect(first).toContain('"b":1');
	});

	it('canonicalizes parsed key order', () => {
		const input = structuredClone(allDrawings);
		input.metadata = { b: 1, a: 2 };
		const parsed = parseDrawingDocument(input);
		expect(Object.keys(parsed.metadata)).toEqual(['a', 'b']);
	});

	it('hashes Drawing and Workspace deterministically', async () => {
		const drawingHash = await hashCanonicalDrawingDocument(allDrawings);
		expect(drawingHash).toMatch(/^[0-9a-f]{64}$/);
		expect(await hashCanonicalDrawingDocument(allDrawings)).toBe(drawingHash);

		const workspaceHash = await hashCanonicalDrawableWorkspace(chartMinimal);
		expect(workspaceHash).toMatch(/^[0-9a-f]{64}$/);
		expect(await hashCanonicalDrawableWorkspace(chartMinimal)).toBe(workspaceHash);
	});

	it('embeds the parsed Scene and Drawing in Workspace bytes', () => {
		const bytes = text(serializeCanonicalDrawableWorkspace(chartMinimal));
		expect(bytes).toContain('"schema":"@baron1996/drawable-workspace"');
		expect(bytes).toContain('"schema":"@baron1996/drawing-document"');
		expect(bytes).toContain('"schema":"@baron1996/kline-scene"');
	});
});
