import { describe, expect, it } from 'vitest';

import type { OverlayPixelGeometry } from '../src/interaction/hit-testing.js';
import { shouldIgnoreStaleOverlayDeselection } from '../src/interaction/selection-arbitration.js';

const updatedGeometries: readonly OverlayPixelGeometry[] = [
	{
		overlayId: 'updated-overlay',
		sceneIndex: 0,
		zLevel: 1,
		locked: false,
		anchors: [{ x: 100, y: 100 }, { x: 200, y: 160 }],
		bodySegments: [[{ x: 100, y: 100 }, { x: 200, y: 160 }]],
		bodyRectangles: [],
	},
	{
		overlayId: 'other-overlay',
		sceneIndex: 1,
		zLevel: 2,
		locked: false,
		anchors: [{ x: 300, y: 100 }, { x: 400, y: 100 }],
		bodySegments: [[{ x: 300, y: 100 }, { x: 400, y: 100 }]],
		bodyRectangles: [],
	},
];

describe('engine deselection arbitration', () => {
	it('rejects stale deselection when the callback coordinate hits the selected Overlay current geometry', () => {
		expect(shouldIgnoreStaleOverlayDeselection(
			'updated-overlay',
			'updated-overlay',
			{ x: 150, y: 130 },
			updatedGeometries,
		)).toBe(true);
	});

	it('preserves real blank deselection', () => {
		expect(shouldIgnoreStaleOverlayDeselection(
			'updated-overlay',
			'updated-overlay',
			{ x: 20, y: 20 },
			updatedGeometries,
		)).toBe(false);
	});

	it('does not hide a selection switch to another Overlay', () => {
		expect(shouldIgnoreStaleOverlayDeselection(
			'updated-overlay',
			'updated-overlay',
			{ x: 350, y: 100 },
			updatedGeometries,
		)).toBe(false);
		expect(shouldIgnoreStaleOverlayDeselection(
			'other-overlay',
			'updated-overlay',
			{ x: 350, y: 100 },
			updatedGeometries,
		)).toBe(false);
	});

	it('keeps existing deselection semantics when callback coordinates are unavailable', () => {
		expect(shouldIgnoreStaleOverlayDeselection(
			'updated-overlay',
			'updated-overlay',
			undefined,
			updatedGeometries,
		)).toBe(false);
	});
});
