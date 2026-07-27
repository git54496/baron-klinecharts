import canonicalize from 'canonicalize';

import { SceneError } from './errors.js';
import { parseChartScene } from './validator.js';

export function serializeCanonicalScene(scene: unknown): Uint8Array<ArrayBuffer> {
	const parsed = parseChartScene(scene);
	const serialized = canonicalize(parsed);
	if (serialized === undefined) {
		throw new SceneError('EXPORT_INVALID', '/', 'Scene could not be serialized.');
	}
	return new TextEncoder().encode(serialized);
}

export async function hashCanonicalScene(scene: unknown): Promise<string> {
	const digest = await globalThis.crypto.subtle.digest('SHA-256', serializeCanonicalScene(scene));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
