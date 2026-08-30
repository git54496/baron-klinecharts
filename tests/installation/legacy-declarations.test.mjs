import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const legacyDeclarationHashes = new Map([
	['packages/scene-schema/dist/errors.d.ts', '102e0124ea9e8d45d71dbec07f55cada70f63842b23cd7e339f2eabf89569151'],
	['packages/scene-schema/dist/generated/chart-scene.d.ts', '68303834f858df0d740b9c04484857245da1104061e559e0c7b75a29375c2459'],
	['packages/scene-schema/dist/validator.d.ts', 'ba77dc8b426bd71317e462109894e6202a7952a560b80e37e688567760e80ec6'],
	['packages/web-runtime/dist/types.d.ts', 'a1be0b50158c9ff5ee2d0c2140f985796bf97895dab942e12d555d142665c93e'],
	['packages/web-runtime/dist/runtime.d.ts', '5f40c533df19461824bbba5b6fc88b463fc29fa5eeb08753cd5ad9e602a62e47'],
	['packages/scene-schema/dist/generated/drawable-workspace.d.ts', 'd0363b019a68f214aeb6712c1259ccef2811baccc947db514914c0bb7935acfb'],
	['packages/scene-schema/dist/generated/drawing-document.d.ts', '002b379b55dcc5c97efdd100ee69e3f714d6886aaed69409c33108d7d6de0fc1'],
	['packages/scene-schema/dist/generated/validate-drawable-workspace.d.ts', '89463534018bab33e74b27b1c06185d781f17f4773674ece37e639626e8cca80'],
	['packages/scene-schema/dist/generated/validate-drawing-document.d.ts', '343934453c59a2eb866afe77f2c073810c3eef4d5c11be9f6bd86536360cc7b6'],
	['packages/scene-schema/dist/drawable-workspace-validator.d.ts', '3276741de5571da1f2135ded489c0295e41c502998a761d64befff3ed736c56c'],
	['packages/scene-schema/dist/drawing-validator.d.ts', 'eed0a102575020949ca8928b2cf3e247b38978b6a0287f37cf60bf9a748b9b43'],
	['packages/scene-schema/dist/drawable-workspace-canonical-json.d.ts', 'd625ea75553b872f83c913814cae9a8580e28730f6371f4a104ee856d6bae10f'],
	['packages/scene-schema/dist/drawing-canonical-json.d.ts', '1a886e25eb92f5d962106f4362d894f9bfd4ff3a9965a1bb59e0eb9355dc475e'],
	['packages/web-runtime/dist/drawing/workspace-runtime.d.ts', 'f54a1fb8d205449b71f6717d1ec9316979442c2fbeb76c3cb94e3c7511fd6be7'],
	['packages/web-runtime/dist/drawing/session-controller.d.ts', '0de72c1cf48d43fc3aebcf09a5988a2e14721c23cc6b089498da3df52b58ab0c'],
	['packages/web-runtime/dist/drawing/projection-service.d.ts', 'ef7b7b02cf190f5dcfb01e89f69d658664acbdc6f8afe83de641247966891f45'],
	['packages/web-runtime/dist/drawing/runtime-capability-descriptor.d.ts', '3f851aff7e1795422265963a7d463294aa4e526cdd2671b017e99e4dfddb9930'],
	['packages/web-runtime/dist/drawing/capabilities.d.ts', '88d70ee30b8b5a2b07faded0403be5e2e2843eff8102072b0c5335916dfd91b1'],
	['packages/web-runtime/dist/drawing/workspace-events.d.ts', '9db578f78e941f3609344c463301bb9cd9e123029d0918c760be527c28d3b798'],
	['packages/cli/dist/commands/workspace.d.ts', '793c1128fcdd3a957e1b5fa3109f6914243a5afc95a8f557c6e52e2b42b7ef47'],
	['packages/cli/dist/commands/drawings.d.ts', 'b8ca9c29af8273319f8d5262fcbb2d7dcaade9077cd9276a059ecadd1f7f3f75'],
]);

const additiveDeclarationBlocks = new Map([
	[
		'packages/web-runtime/dist/types.d.ts',
		[
			`export interface DrawingFloatingToolbarOptions {
    readonly deleteBehavior?: 'direct' | 'request';
    readonly draggable?: boolean;
}
export interface DrawingFloatingToolbar {
    readonly element: HTMLElement;
    resetPosition(): void;
    destroy(): void;
}
`,
			`    setHostActionState(actionId: string, state: {
        readonly pressed?: boolean;
        readonly disabled?: boolean;
        readonly pending?: boolean;
        readonly errorMessage?: string | null;
    }): void;
`,
		],
	],
	[
		'packages/web-runtime/dist/runtime.d.ts',
		[
			'    updateDrawingLocked(id: string, locked: boolean): EngineDrawingSnapshot;\n',
			`    getDrawingMutationState(): 'ready';
    subscribeDrawingChanges(listener: () => void): () => void;
`,
		],
	],
	[
		'packages/web-runtime/dist/drawing/runtime-capability-descriptor.d.ts',
		[
			`    readonly pressed?: boolean;
    readonly disabled?: boolean;
    readonly pending?: boolean;
    readonly errorMessage?: string;
`,
		],
	],
	[
		'packages/web-runtime/dist/drawing/workspace-runtime.d.ts',
		[
			' MarketData,',
			' EngineHistoricalDataCommitResult,',
			' HistoricalDataRuntimeCapability,',
			', HistoricalDataRuntimeCapability',
			`    readonly historicalDataLoading?: {
        readonly hasMore: boolean;
    };
`,
			`    /** 仅用于 UI 展示；不会写入 Workspace，也不会改变投影与会话时区。 */
    readonly displayTimezone?: string;
`,
			`    commitHistoricalData(requestId: string, data: readonly MarketData[], hasMore: boolean): EngineHistoricalDataCommitResult;
    rejectHistoricalData(requestId: string, message: string): boolean;
`,
			"import { DrawingSessionController } from './session-controller.js';\n",
			'    updateDrawingLocked(id: string, locked: boolean): EngineDrawingSnapshot;\n',
			`    getDrawingMutationState(): 'ready' | 'busy';
    subscribeDrawingChanges(listener: () => void): () => void;
`,
			`    /** 跨周期等宿主编排只能连接显式 host-confirmed Runtime。 */
    get commitMode(): DrawableWorkspaceRuntimeOptions['commitMode'];
    /** 只暴露公共会话状态，不暴露 Adapter 或 Chart。 */
    getDrawingSessionState(): DrawingSessionController['state'];
`,
			'        readonly groupId?: string;\n',
			"        readonly metadata?: NonNullable<Drawing['metadata']>;\n",
		],
	],
	[
		'packages/web-runtime/dist/drawing/session-controller.d.ts',
		[
			'        readonly groupId?: string;\n',
			"        readonly metadata?: NonNullable<EngineDrawingSnapshot['metadata']>;\n",
			'    updateDrawingLocked(id: string, locked: boolean): EngineDrawingSnapshot;\n',
			`    /** 当前已确认的投影 Scene；仅返回深拷贝，协调层不能取得引擎对象。 */
    get projectionScene(): ProjectionScene;
`,
			`    /**
     * 在同一个 Adapter 内原子替换 Scene 投影上下文。
     * 候选 Scene 先以 confirmed Drawing 全量验证，成功应用引擎后才提升为当前投影 Scene。
     */
    replaceProjectionScene<T>(scene: ProjectionScene, apply: () => T): T;
    /** 异步版本用于轴等需要等待 Adapter 原子应用完成的 Scene 事务。 */
    replaceProjectionSceneAsync<T>(scene: ProjectionScene, apply: () => Promise<T>): Promise<T>;
`,
		],
	],
	[
		'packages/web-runtime/dist/drawing/capabilities.d.ts',
		[
			', MarketData',
			'EngineHistoricalDataCommitResult, ',
			`/** 由宿主接管网络请求的更早行情能力。 */
export interface HistoricalDataRuntimeCapability {
    commitHistoricalData(requestId: string, data: readonly MarketData[], hasMore: boolean): EngineHistoricalDataCommitResult;
    rejectHistoricalData(requestId: string, message: string): boolean;
}
`,
			'    updateDrawingLocked(id: string, locked: boolean): EngineDrawingSnapshot;\n',
			`    getDrawingMutationState(): 'ready' | 'busy';
    subscribeDrawingChanges(listener: () => void): () => void;
`,
			'        readonly groupId?: string;\n',
			"        readonly metadata?: NonNullable<Drawing['metadata']>;\n",
		],
	],
	[
		'packages/web-runtime/dist/drawing/workspace-events.d.ts',
		[
			"import type { EngineHistoricalDataRequest } from '@baron1996/klinecharts-adapter';\n",
			` | ({
    readonly type: 'historical-data-requested';
} & EngineHistoricalDataRequest) | {
    readonly type: 'historical-data-appended';
    readonly requestId: string;
    readonly addedCount: number;
    readonly totalCount: number;
    readonly hasMore: boolean;
} | {
    readonly type: 'historical-data-rejected';
    readonly requestId: string;
    readonly message: string;
}`,
		],
	],
]);

function projectLegacyDeclaration(path, content) {
	let legacyContent = content;
	for (const block of additiveDeclarationBlocks.get(path) ?? []) {
		assert.equal(
			legacyContent.includes(block),
			true,
			`${path} is missing its expected additive API block`,
		);
		legacyContent = legacyContent.replace(block, '');
	}
	return legacyContent;
}

test('legacy schema errors and Runtime declaration projections remain byte-for-byte compatible', async () => {
	for (const [path, expectedHash] of legacyDeclarationHashes) {
		const content = projectLegacyDeclaration(path, await readFile(path, 'utf8'));
		const actualHash = createHash('sha256').update(content).digest('hex');
		assert.equal(actualHash, expectedHash, `${path} changed unexpectedly`);
	}
});
