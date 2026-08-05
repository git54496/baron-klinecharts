import type {
	DrawingDocument,
	DrawingMetadataValue,
} from './generated/drawing-document.js';

type DrawingJsonValue =
	| DrawingMetadataValue
	| DrawingJsonValue[]
	| { [key: string]: DrawingJsonValue | undefined };

function sortDrawingJson(value: DrawingJsonValue): DrawingJsonValue {
	if (Array.isArray(value)) {
		return value.map((item) => sortDrawingJson(item));
	}
	if (value !== null && typeof value === 'object') {
		const sorted: Record<string, DrawingJsonValue> = {};
		for (const key of Object.keys(value).sort()) {
			const child = value[key];
			if (child !== undefined) {
				sorted[key] = sortDrawingJson(child);
			}
		}
		return sorted;
	}
	return value;
}

export function canonicalizeDrawingDocument(
	document: DrawingDocument,
): DrawingDocument {
	return sortDrawingJson(
		structuredClone(document) as unknown as DrawingJsonValue,
	) as unknown as DrawingDocument;
}
