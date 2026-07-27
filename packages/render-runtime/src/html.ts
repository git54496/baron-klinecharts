import {
	serializeCanonicalScene,
} from '@baron1996/kline-scene-schema';

import {
	SCENE_BASE64_PLACEHOLDER,
	STANDALONE_HTML_TEMPLATE,
} from './assets.generated.js';

/** 将规范化场景嵌入唯一的 Base64 占位符并生成完全自包含 HTML。 */
export function buildStandaloneHtml(scene: unknown): string {
	const bytes = serializeCanonicalScene(scene);
	const encoded = Buffer.from(bytes).toString('base64');
	const first = STANDALONE_HTML_TEMPLATE.indexOf(SCENE_BASE64_PLACEHOLDER);
	const last = STANDALONE_HTML_TEMPLATE.lastIndexOf(SCENE_BASE64_PLACEHOLDER);
	if (first < 0 || first !== last) {
		throw new Error('Standalone HTML template must contain exactly one Scene placeholder.');
	}
	return `${STANDALONE_HTML_TEMPLATE.slice(0, first)}${encoded}${STANDALONE_HTML_TEMPLATE.slice(first + SCENE_BASE64_PLACEHOLDER.length)}`;
}
