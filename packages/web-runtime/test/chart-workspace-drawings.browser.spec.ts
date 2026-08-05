import { expect, test } from '@playwright/test';

import {
	installWorkspaceRuntime,
	runBasicJourney,
	SUPPORTED_TYPES,
	TEXT_TYPES,
} from './drawing-interaction-matrix.js';

for (const type of SUPPORTED_TYPES) {
	test(`@browser chart Workspace ${type} full interaction journey`, async ({ page }) => {
		await installWorkspaceRuntime(page, 'chart');
		const result = await runBasicJourney(page, type);
		expect(result.completed).toBe(true);
		expect(result.exportedGeometry).toBe(true);
		expect(result.styleUpdated).toBe(true);
		if (TEXT_TYPES.has(type)) {
			expect(result.textUpdated).toBe(true);
		}
		expect(result.selected).toBe(result.started);
		expect(result.removed).toBe(true);
		expect(result.finalExportCount).toBe(0);
	});
}
