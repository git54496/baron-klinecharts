import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './test',
	testMatch: '**/*.browser.spec.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 60_000,
	use: {
		baseURL: 'http://127.0.0.1:4173',
		browserName: 'chromium',
		headless: true,
	},
	webServer: {
		command: 'vite --host 127.0.0.1 --port 4173 --strictPort',
		url: 'http://127.0.0.1:4173/test/fixture.html',
		reuseExistingServer: false,
		timeout: 30_000,
	},
});
