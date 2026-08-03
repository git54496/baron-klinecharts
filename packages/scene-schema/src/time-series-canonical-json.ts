import canonicalize from 'canonicalize';

import { TimeSeriesSceneError } from './time-series-errors.js';
import { parseTimeSeriesScene } from './time-series-validator.js';

export function serializeCanonicalTimeSeriesScene(
	scene: unknown,
): Uint8Array<ArrayBuffer> {
	const parsed = parseTimeSeriesScene(scene);
	const serialized = canonicalize(parsed);
	if (serialized === undefined) {
		throw new TimeSeriesSceneError(
			'TIME_SERIES_EXPORT_INVALID',
			'/',
			'TimeSeriesScene could not be serialized.',
		);
	}
	return new TextEncoder().encode(serialized);
}

export async function hashCanonicalTimeSeriesScene(
	scene: unknown,
): Promise<string> {
	const digest = await globalThis.crypto.subtle.digest(
		'SHA-256',
		serializeCanonicalTimeSeriesScene(scene),
	);
	return Array.from(
		new Uint8Array(digest),
		(byte) => byte.toString(16).padStart(2, '0'),
	).join('');
}
