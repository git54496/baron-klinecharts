import { describe, expect, it } from 'vitest';

import {
	DEFAULT_OVERLAY_TOUCH_HIT_TOLERANCE,
	hitTestOverlayGeometries,
	OVERLAY_ANCHOR_HIT_THRESHOLD_CSS_PX,
	OVERLAY_BODY_HIT_THRESHOLD_CSS_PX,
	type OverlayPixelGeometry,
} from '../src/interaction/hit-testing.js';

function geometry(
	overlayId: string,
	options: Partial<OverlayPixelGeometry> = {},
): OverlayPixelGeometry {
	return {
		overlayId,
		sceneIndex: 0,
		zLevel: 0,
		locked: false,
		anchors: [{ x: 20, y: 20 }, { x: 80, y: 20 }],
		bodySegments: [[{ x: 20, y: 20 }, { x: 80, y: 20 }]],
		bodyRectangles: [],
		...options,
	};
}

describe('M2 controlled Overlay hit testing', () => {
	it('uses inclusive 12 CSS px body and 14 CSS px anchor thresholds', () => {
		expect(hitTestOverlayGeometries(
			{ x: 50, y: 20 + OVERLAY_BODY_HIT_THRESHOLD_CSS_PX },
			[geometry('body', { anchors: [] })],
		)).toMatchObject({ overlayId: 'body', target: 'body' });
		expect(hitTestOverlayGeometries(
			{ x: 50, y: 20 + OVERLAY_BODY_HIT_THRESHOLD_CSS_PX + 1 },
			[geometry('body', { anchors: [] })],
		)).toBeNull();

		expect(hitTestOverlayGeometries(
			{ x: 20 + OVERLAY_ANCHOR_HIT_THRESHOLD_CSS_PX, y: 20 },
			[geometry('anchor')],
		)).toMatchObject({ overlayId: 'anchor', target: 'anchor', anchorIndex: 0 });
		expect(hitTestOverlayGeometries(
			{ x: 20 + OVERLAY_ANCHOR_HIT_THRESHOLD_CSS_PX + 1, y: 20 },
			[geometry('anchor', { bodySegments: [] })],
		)).toBeNull();
	});

	it('uses a 44 CSS px touch band and 48 CSS px touch anchors', () => {
		expect(hitTestOverlayGeometries(
			{ x: 50, y: 20 + DEFAULT_OVERLAY_TOUCH_HIT_TOLERANCE.body },
			[geometry('touch-body', { anchors: [] })],
			DEFAULT_OVERLAY_TOUCH_HIT_TOLERANCE,
		)).toMatchObject({ overlayId: 'touch-body', target: 'body' });
		expect(hitTestOverlayGeometries(
			{ x: 50, y: 20 + DEFAULT_OVERLAY_TOUCH_HIT_TOLERANCE.body + 1 },
			[geometry('touch-body', { anchors: [] })],
			DEFAULT_OVERLAY_TOUCH_HIT_TOLERANCE,
		)).toBeNull();

		expect(hitTestOverlayGeometries(
			{ x: 20 + DEFAULT_OVERLAY_TOUCH_HIT_TOLERANCE.anchor, y: 20 },
			[geometry('touch-anchor')],
			DEFAULT_OVERLAY_TOUCH_HIT_TOLERANCE,
		)).toMatchObject({ overlayId: 'touch-anchor', target: 'anchor' });
	});

	it('hits annotation rectangles and prefers the nearest body candidate', () => {
		const hit = hitTestOverlayGeometries(
			{ x: 52, y: 50 },
			[
				geometry('far-higher', {
					anchors: [],
					bodySegments: [],
					bodyRectangles: [{ left: 60, top: 40, right: 90, bottom: 70 }],
					zLevel: 100,
				}),
				geometry('near-lower', {
					anchors: [],
					bodySegments: [],
					bodyRectangles: [{ left: 50, top: 40, right: 55, bottom: 70 }],
					zLevel: 0,
				}),
			],
		);
		expect(hit).toMatchObject({ overlayId: 'near-lower', target: 'body' });
	});

	it('prioritizes anchor globally, then zLevel and later Scene order', () => {
		const hit = hitTestOverlayGeometries(
			{ x: 20, y: 20 },
			[
				geometry('high-body', { zLevel: 100, anchors: [] }),
				geometry('low-anchor', { zLevel: -100, sceneIndex: 1 }),
			],
		);
		expect(hit).toMatchObject({ overlayId: 'low-anchor', target: 'anchor' });

		const ranked = hitTestOverlayGeometries(
			{ x: 50, y: 20 },
			[
				geometry('earlier', { anchors: [], sceneIndex: 0, zLevel: 2 }),
				geometry('later', { anchors: [], sceneIndex: 1, zLevel: 2 }),
				geometry('lower', { anchors: [], sceneIndex: 2, zLevel: 1 }),
			],
		);
		expect(ranked).toMatchObject({ overlayId: 'later', target: 'body' });
	});

	it('chooses the lower anchor index when one Overlay anchors overlap', () => {
		const hit = hitTestOverlayGeometries(
			{ x: 20, y: 20 },
			[geometry('overlap', { anchors: [{ x: 20, y: 20 }, { x: 20, y: 20 }] })],
		);
		expect(hit).toMatchObject({ overlayId: 'overlap', anchorIndex: 0 });
	});

	it('retains locked state for selection without weakening hit rules', () => {
		expect(hitTestOverlayGeometries(
			{ x: 50, y: 20 },
			[geometry('locked', { locked: true, anchors: [] })],
		)).toEqual({
			overlayId: 'locked',
			target: 'body',
			anchorIndex: null,
			locked: true,
		});
	});
});
