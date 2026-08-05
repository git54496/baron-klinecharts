import canonicalize from 'canonicalize';

import { DrawingDocumentError } from './drawing-errors.js';
import { parseDrawingDocument } from './drawing-validator.js';

export function serializeCanonicalDrawingDocument(
	value: unknown,
): Uint8Array<ArrayBuffer> {
	const parsed = parseDrawingDocument(value);
	const serialized = canonicalize(parsed);
	if (serialized === undefined) {
		throw new DrawingDocumentError(
			'DRAWING_DOCUMENT_SCHEMA_INVALID',
			'/',
			'DrawingDocument could not be serialized.',
		);
	}
	return new TextEncoder().encode(serialized);
}

export async function hashCanonicalDrawingDocument(
	value: unknown,
): Promise<string> {
	const digest = await globalThis.crypto.subtle.digest(
		'SHA-256',
		serializeCanonicalDrawingDocument(value),
	);
	return Array.from(
		new Uint8Array(digest),
		(byte) => byte.toString(16).padStart(2, '0'),
	).join('');
}
