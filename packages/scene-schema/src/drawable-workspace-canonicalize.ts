import type {
	DrawableWorkspaceDocument,
	DrawableWorkspaceMetadataValue,
} from './generated/drawable-workspace.js';

type WorkspaceJsonValue =
	| DrawableWorkspaceMetadataValue
	| WorkspaceJsonValue[]
	| { [key: string]: WorkspaceJsonValue | undefined };

function sortWorkspaceJson(value: WorkspaceJsonValue): WorkspaceJsonValue {
	if (Array.isArray(value)) {
		return value.map((item) => sortWorkspaceJson(item));
	}
	if (value !== null && typeof value === 'object') {
		const sorted: Record<string, WorkspaceJsonValue> = {};
		for (const key of Object.keys(value).sort()) {
			const child = value[key];
			if (child !== undefined) {
				sorted[key] = sortWorkspaceJson(child);
			}
		}
		return sorted;
	}
	return value;
}

export function canonicalizeDrawableWorkspace(
	workspace: DrawableWorkspaceDocument,
): DrawableWorkspaceDocument {
	return sortWorkspaceJson(
		structuredClone(workspace) as unknown as WorkspaceJsonValue,
	) as unknown as DrawableWorkspaceDocument;
}
