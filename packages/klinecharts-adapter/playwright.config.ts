import { defineConfig } from '@playwright/test';

// Allow package regression tests without taking over a host app's preview port.
const port = Number(process.env.BARON_TEST_PORT ?? 4173);

export default defineConfig({
	testDir: './test',
	testMatch: '**/*.browser.spec.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 60_000,
	use: {
		baseURL: `http://127.0.0.1:${port}`,
		browserName: 'chromium',
		headless: true,
	},
	webServer: {
		command: `vite --host 127.0.0.1 --port ${port} --strictPort`,
		url: `http://127.0.0.1:${port}/test/fixture.html`,
		reuseExistingServer: false,
		timeout: 30_000,
	},
});
