import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	mkdir,
	readFile,
	readdir,
	writeFile,
} from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const publicPackageDirectories = [
	'packages/scene-schema',
	'packages/klinecharts-adapter',
	'packages/web-runtime',
	'packages/cli',
];

const publicPackageNames = [
	'@baron1996/kline-scene-schema',
	'@baron1996/klinecharts-adapter',
	'@baron1996/klinecharts-runtime',
	'@baron1996/klinecharts-cli',
];

const npmRegistry = 'https://registry.npmjs.org/';

function npmCommand(arguments_, options) {
	const npmCli = process.env.npm_execpath;
	if (npmCli === undefined) {
		return execFileSync('npm', arguments_, options);
	}
	return execFileSync(process.execPath, [npmCli, ...arguments_], options);
}

export function validatePublicManifest(manifest, expectedName) {
	if (manifest.private === true) {
		throw new Error(`${String(manifest.name)} must not be private.`);
	}
	if (expectedName !== undefined && manifest.name !== expectedName) {
		throw new Error(
			`Expected ${expectedName}, received ${String(manifest.name)}.`,
		);
	}
	if (manifest.publishConfig?.access !== 'public') {
		throw new Error(`${String(manifest.name)} must publish with public access.`);
	}
	if (manifest.publishConfig?.registry !== npmRegistry) {
		throw new Error(`${String(manifest.name)} must publish to ${npmRegistry}.`);
	}

	for (const dependencyGroup of [
		'dependencies',
		'devDependencies',
		'optionalDependencies',
		'peerDependencies',
	]) {
		for (const [name, version] of Object.entries(
			manifest[dependencyGroup] ?? {},
		)) {
			if (String(version).startsWith('workspace:')) {
				throw new Error(
					`${String(manifest.name)} has workspace dependency ${name}.`,
				);
			}
		}
	}
}

export function selectPublicPackages(packages, releaseVersion) {
	if (releaseVersion === undefined) {
		return packages;
	}
	const selected = packages.filter(
		({ manifest }) => manifest.version === releaseVersion,
	);
	if (selected.length === 0) {
		throw new Error(
			`no public npm package declares version ${releaseVersion}.`,
		);
	}
	return selected;
}

async function ensureEmptyDirectory(outputDirectory) {
	try {
		const entries = await readdir(outputDirectory);
		if (entries.length !== 0) {
			throw new Error(
				`Release output directory must be empty: ${outputDirectory}`,
			);
		}
	} catch (error) {
		if (
			!(error instanceof Error) ||
			!('code' in error) ||
			error.code !== 'ENOENT'
		) {
			throw error;
		}
		await mkdir(outputDirectory, { recursive: true });
	}
}

function digest(algorithm, content, encoding) {
	return createHash(algorithm).update(content).digest(encoding);
}

export async function buildNpmArtifacts({
	root = process.cwd(),
	outputDirectory = resolve(root, 'release-artifacts', 'npm'),
	releaseVersion,
} = {}) {
	const absoluteRoot = resolve(root);
	const absoluteOutput = resolve(outputDirectory);
	await ensureEmptyDirectory(absoluteOutput);

	const publicPackages = [];
	for (const [index, packageDirectory] of publicPackageDirectories.entries()) {
		const absolutePackage = resolve(absoluteRoot, packageDirectory);
		const manifest = JSON.parse(
			await readFile(join(absolutePackage, 'package.json'), 'utf8'),
		);
		validatePublicManifest(manifest, publicPackageNames[index]);
		publicPackages.push({ directory: packageDirectory, manifest });
	}

	const packages = [];
	for (const { directory: packageDirectory, manifest } of selectPublicPackages(
		publicPackages,
		releaseVersion,
	)) {
		const absolutePackage = resolve(absoluteRoot, packageDirectory);

		const output = npmCommand(
			[
				'pack',
				'--json',
				'--pack-destination',
				absoluteOutput,
			],
			{
				cwd: absolutePackage,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'inherit'],
			},
		);
		const metadata = JSON.parse(output)[0];
		if (metadata.name !== manifest.name || metadata.version !== manifest.version) {
			throw new Error(
				`Packed identity mismatch for ${packageDirectory}: ${String(metadata.name)}@${String(metadata.version)}.`,
			);
		}

		const filename = metadata.filename;
		const content = await readFile(join(absoluteOutput, filename));
		const integrity = `sha512-${digest('sha512', content, 'base64')}`;
		if (metadata.integrity !== integrity) {
			throw new Error(`npm integrity mismatch for ${filename}.`);
		}
		packages.push({
			directory: packageDirectory,
			name: manifest.name,
			version: manifest.version,
			filename,
			sha256: digest('sha256', content, 'hex'),
			integrity,
		});
	}

	const result = {
		schemaVersion: 1,
		packages,
	};
	await writeFile(
		join(absoluteOutput, 'npm-artifacts.json'),
		`${JSON.stringify(result, null, 2)}\n`,
	);
	await writeFile(
		join(absoluteOutput, 'SHA256SUMS'),
		`${packages.map((entry) => `${entry.sha256}  ${entry.filename}`).join('\n')}\n`,
	);
	return result;
}

function argumentValue(name) {
	const index = process.argv.indexOf(name);
	if (index === -1) {
		return undefined;
	}
	const value = process.argv[index + 1];
	if (value === undefined || value.startsWith('--')) {
		throw new Error(`${name} requires a value.`);
	}
	return value;
}

const invokedPath =
	process.argv[1] === undefined
		? undefined
		: pathToFileURL(resolve(process.argv[1])).href;

if (invokedPath === import.meta.url) {
	try {
		const root = process.cwd();
		const requestedOutput = argumentValue('--output');
		const outputDirectory =
			requestedOutput === undefined
				? resolve(root, 'release-artifacts', 'npm')
				: resolve(root, requestedOutput);
		const result = await buildNpmArtifacts({
			root,
			outputDirectory,
			releaseVersion: argumentValue('--version'),
		});
		process.stdout.write(
			`Built ${result.packages.length} npm artifacts in ${relative(root, outputDirectory)}.\n`,
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`npm artifact build failed: ${message}\n`);
		process.exitCode = 1;
	}
}
