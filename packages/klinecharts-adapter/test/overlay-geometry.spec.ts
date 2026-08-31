import type { SceneOverlay } from '@baron1996/kline-scene-schema';
import { describe, expect, it } from 'vitest';

import {
	DEFAULT_OVERLAY_TOUCH_HIT_TOLERANCE,
	hitTestOverlayGeometries,
} from '../src/interaction/hit-testing.js';
import { projectOverlayGeometry } from '../src/interaction/overlay-geometry.js';

const styles: SceneOverlay['styles'] = {
	line: { color: 'rgba(41, 98, 255, 1)', size: 1, style: 'solid' },
	fill: { color: 'rgba(41, 98, 255, 0.15)' },
	text: {
		color: 'rgba(255, 255, 255, 1)',
		size: 12,
		family: 'Baron Sans',
		weight: 'normal',
		backgroundColor: 'rgba(41, 98, 255, 1)',
		borderColor: 'rgba(41, 98, 255, 1)',
	},
};

function overlay(value: Partial<SceneOverlay>): SceneOverlay {
	return {
		id: 'drawing',
		type: 'segment',
		paneId: 'pane-candle',
		visible: true,
		locked: false,
		zLevel: 0,
		mode: 'normal',
		styles,
		...value,
	};
}

const projection = {
	bounds: { left: 0, top: 0, right: 400, bottom: 300 },
	referenceTimestamp: 100,
	referenceValue: 100,
	project: (point: { readonly timestamp: number; readonly value: number }) => ({
		x: point.timestamp,
		y: point.value,
	}),
	measureText: () => ({ width: 72, height: 18 }),
};

describe('Drawing interaction geometry projection', () => {
	it('covers the annotation leader and text label instead of only its anchor', () => {
		const geometry = projectOverlayGeometry(
			overlay({
				type: 'simpleAnnotation',
				point: { timestamp: 160, value: 180 },
				text: '重要位置',
			}),
			0,
			projection,
		);
		expect(geometry).not.toBeNull();
		expect(hitTestOverlayGeometries(
			{ x: 160, y: 119 },
			[geometry!],
			DEFAULT_OVERLAY_TOUCH_HIT_TOLERANCE,
		)).toMatchObject({ overlayId: 'drawing', target: 'body' });
	});

	it('uses the filled rectangle as body geometry while retaining both anchors', () => {
		const geometry = projectOverlayGeometry(
			overlay({
				type: 'rectangle',
				start: { timestamp: 80, value: 90 },
				end: { timestamp: 220, value: 210 },
			}),
			0,
			projection,
		);
		expect(geometry?.anchors).toHaveLength(2);
		expect(hitTestOverlayGeometries({ x: 150, y: 150 }, [geometry!])).toMatchObject({
			overlayId: 'drawing',
			target: 'body',
		});
	});
});
