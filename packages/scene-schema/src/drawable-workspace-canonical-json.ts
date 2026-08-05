import canonicalize from 'canonicalize';

import { DrawableWorkspaceError } from './drawable-workspace-errors.js';
import { parseDrawableWorkspaceDocument } from './drawable-workspace-validator.js';

export function serializeCanonicalDrawableWorkspace(
	value: unknown,
): Uint8Array<ArrayBuffer> {
	const parsed = parseDrawableWorkspaceDocument(value);
	const serialized = canonicalize(parsed);
	if (serialized === undefined) {
		throw new DrawableWorkspaceError(
			'DRAWABLE_WORKSPACE_SCHEMA_INVALID',
			'/',
			'DrawableWorkspaceDocument could not be serialized.',
		);
	}
	return new TextEncoder().encode(serialized);
}

export async function hashCanonicalDrawableWorkspace(
	value: unknown,
): Promise<string> {
	const digest = await globalThis.crypto.subtle.digest(
		'SHA-256',
		serializeCanonicalDrawableWorkspace(value),
	);
	return Array.from(
		new Uint8Array(digest),
		(byte) => byte.toString(16).padStart(2, '0'),
	).join('');
}
