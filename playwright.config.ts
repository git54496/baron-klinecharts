import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests',
	fullyParallel: false,
	workers: 1,
	timeout: 90_000,
	expect: {
		timeout: 10_000,
	},
	use: {
		baseURL: 'http://127.0.0.1:4175',
		browserName: 'chromium',
		headless: true,
		locale: 'zh-CN',
		timezoneId: 'Asia/Shanghai',
	},
	webServer: {
		command: 'vite --host 127.0.0.1 --port 4175 --strictPort',
		url: 'http://127.0.0.1:4175/packages/web-runtime/test/fixture.html',
		reuseExistingServer: false,
		timeout: 30_000,
	},
});
