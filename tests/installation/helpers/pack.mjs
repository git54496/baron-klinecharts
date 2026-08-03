import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

export const packageDirectories = [
	'packages/scene-schema',
	'packages/klinecharts-adapter',
	'packages/web-runtime',
	'packages/cli',
];

const packageNames = [
	'@baron1996/kline-scene-schema',
	'@baron1996/klinecharts-adapter',
	'@baron1996/klinecharts-runtime',
	'@baron1996/klinecharts-cli',
];

export function runNpm(arguments_, options = {}) {
	const npmCli = process.env.npm_execpath;
	if (npmCli === undefined) {
		return execFileSync('npm', arguments_, options);
	}
	return execFileSync(process.execPath, [npmCli, ...arguments_], options);
}

export async function packPublicPackages() {
	const artifactDirectory = process.env.BARON_NPM_ARTIFACT_DIR;
	if (artifactDirectory !== undefined) {
		return loadPublicPackageArtifacts(artifactDirectory);
	}

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

async function loadPublicPackageArtifacts(artifactDirectory) {
	const absoluteArtifactDirectory = resolve(artifactDirectory);
	const manifest = JSON.parse(
		await readFile(
			join(absoluteArtifactDirectory, 'npm-artifacts.json'),
			'utf8',
		),
	);
	if (manifest.schemaVersion !== 1) {
		throw new Error('npm artifact manifest schemaVersion must be 1.');
	}
	if (!Array.isArray(manifest.packages) || manifest.packages.length !== 4) {
		throw new Error('npm artifact manifest must contain exactly four packages.');
	}
	if (
		manifest.packages.some((entry, index) =>
			entry.directory !== packageDirectories[index] ||
			entry.name !== packageNames[index]
		)
	) {
		throw new Error('npm artifact manifest package order or identity is invalid.');
	}

	const packages = [];
	for (const entry of manifest.packages) {
		if (basename(entry.filename) !== entry.filename) {
			throw new Error(`npm artifact filename is invalid: ${String(entry.filename)}.`);
		}
		const tarball = join(absoluteArtifactDirectory, entry.filename);
		const content = await readFile(tarball);
		const sha256 = createHash('sha256').update(content).digest('hex');
		const integrity = `sha512-${createHash('sha512').update(content).digest('base64')}`;
		if (sha256 !== entry.sha256 || integrity !== entry.integrity) {
			throw new Error(`npm artifact checksum mismatch: ${entry.filename}.`);
		}
		const files = execFileSync('tar', ['-tzf', tarball], {
			encoding: 'utf8',
		}).trim().split('\n').filter(Boolean).map((path) => ({
			path: path.startsWith('package/') ? path.slice('package/'.length) : path,
		}));
		packages.push({
			directory: entry.directory,
			tarball,
			metadata: { ...entry, files },
		});
	}

	return {
		directory: await mkdtemp(join(tmpdir(), 'baron-artifact-consumer-')),
		packages,
	};
}
