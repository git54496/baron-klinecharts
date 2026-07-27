import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const releaseManifestPaths = [
	'package.json',
	'packages/scene-schema/package.json',
	'packages/klinecharts-adapter/package.json',
	'packages/web-runtime/package.json',
	'packages/render-runtime/package.json',
	'packages/cli/package.json',
];

const stableReleaseTag = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;

async function readJson(path) {
	return JSON.parse(await readFile(path, 'utf8'));
}

export async function checkReleaseVersion({ root = process.cwd(), tag } = {}) {
	if (typeof tag !== 'string' || tag.length === 0) {
		throw new Error('A release tag is required.');
	}
	const match = stableReleaseTag.exec(tag);
	if (match === null) {
		throw new Error(`"${tag}" is an invalid stable release tag.`);
	}
	const version = `${match[1]}.${match[2]}.${match[3]}`;

	for (const relativePath of releaseManifestPaths) {
		const manifest = await readJson(resolve(root, relativePath));
		if (manifest.version !== version) {
			throw new Error(
				`${relativePath} declares ${String(manifest.version)} but ${tag} requires ${version}.`,
			);
		}
	}

	const pythonPath = 'python/baron-klinecharts/pyproject.toml';
	const pyproject = await readFile(resolve(root, pythonPath), 'utf8');
	const pythonVersions = [
		...pyproject.matchAll(/^version = "([^"]+)"$/gmu),
	].map((candidate) => candidate[1]);
	if (pythonVersions.length !== 1) {
		throw new Error(`${pythonPath} must declare exactly one project version.`);
	}
	if (pythonVersions[0] !== version) {
		throw new Error(
			`${pythonPath} declares ${pythonVersions[0]} but ${tag} requires ${version}.`,
		);
	}

	return version;
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
		const version = await checkReleaseVersion({
			tag: argumentValue('--tag') ?? process.env.GITHUB_REF_NAME,
		});
		process.stdout.write(`${version}\n`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`Release version check failed: ${message}\n`);
		process.exitCode = 1;
	}
}
