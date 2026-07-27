import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const packageDirectories = [
	'packages/scene-schema',
	'packages/klinecharts-adapter',
	'packages/web-runtime',
	'packages/cli',
];

export function runNpm(arguments_, options = {}) {
	const npmCli = process.env.npm_execpath;
	if (npmCli === undefined) {
		return execFileSync('npm', arguments_, options);
	}
	return execFileSync(process.execPath, [npmCli, ...arguments_], options);
}

export async function packPublicPackages() {
	const directory = await mkdtemp(join(tmpdir(), 'baron-public-packages-'));
	const outputDirectory = join(directory, 'tarballs');
	await mkdir(outputDirectory);
	const packages = [];
	for (const packageDirectory of packageDirectories) {
		const output = runNpm(
			[
				'pack',
				'--json',
				'--pack-destination',
				outputDirectory,
			],
			{
				cwd: resolve(packageDirectory),
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'inherit'],
			},
		);
		const result = JSON.parse(output)[0];
		packages.push({
			directory: packageDirectory,
			tarball: join(outputDirectory, result.filename),
			metadata: result,
		});
	}
	return { directory, packages };
}
