import type { registerOverlay } from 'klinecharts';

import { arrowOverlay } from './arrow.js';
import { calloutOverlay } from './callout.js';
import { crossLineOverlay } from './cross-line.js';
import { rectangleOverlay } from './rectangle.js';
import { textOverlay } from './text.js';

type KLineOverlayTemplate = Parameters<typeof registerOverlay>[0];
type RegisterOverlay = (template: KLineOverlayTemplate) => void;

const projectExtensions = [
	rectangleOverlay,
	arrowOverlay,
	crossLineOverlay,
	calloutOverlay,
	textOverlay,
] as const;

let registered = false;

/** 在当前浏览器 Runtime 内恰好注册一次项目扩展。 */
export function registerProjectOverlays(register: RegisterOverlay): void {
	if (registered) {
		return;
	}
	for (const extension of projectExtensions) {
		register(extension);
	}
	registered = true;
}

export function areProjectOverlaysRegistered(): boolean {
	return registered;
}
