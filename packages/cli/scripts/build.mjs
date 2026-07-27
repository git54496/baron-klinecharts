import { chmod, mkdir } from 'node:fs/promises';

import { build } from 'esbuild';

await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
await build({
	entryPoints: [new URL('../src/cli.ts', import.meta.url).pathname],
	outfile: new URL('../dist/cli.js', import.meta.url).pathname,
	bundle: true,
	platform: 'node',
	format: 'esm',
	target: 'node22',
	external: ['playwright', 'playwright/*'],
	legalComments: 'none',
	sourcemap: false,
});
await chmod(new URL('../dist/cli.js', import.meta.url), 0o755);
