import { serializeCanonicalDrawableWorkspace } from '@baron1996/kline-scene-schema';

import { injectSceneBytes } from './html.js';

/** 将规范化 DrawableWorkspaceDocument 嵌入唯一的 Base64 占位符。 */
export function buildDrawableWorkspaceStandaloneHtml(
	workspace: unknown,
): string {
	return injectSceneBytes(serializeCanonicalDrawableWorkspace(workspace));
}
