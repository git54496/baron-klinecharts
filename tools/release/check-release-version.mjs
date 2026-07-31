import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const releaseManifestPaths = [
	'packages/scene-schema/package.json',
	'packages/klinecharts-adapter/package.json',
	'packages/web-runtime/package.json',
	'packages/render-runtime/package.json',
	'packages/cli/package.json',
];

const publicManifestPaths = new Set([
	'packages/scene-schema/package.json',
	'packages/klinecharts-adapter/package.json',
	'packages/web-runtime/package.json',
	'packages/cli/package.json',
]);

const stableReleaseTag = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;

async function readJson(path) {
	return JSON.parse(await readFile(path, 'utf8'));
}

function parseStableVersion(tag) {
	if (typeof tag !== 'string' || tag.length === 0) {
		throw new Error('A release tag is required.');
	}
	const match = stableReleaseTag.exec(tag);
	if (match === null) {
		throw new Error(`"${tag}" is an invalid stable release tag.`);
	}
	return `${match[1]}.${match[2]}.${match[3]}`;
}

function readPythonVersion(pyproject, pythonPath) {
	const pythonVersions = [
		...pyproject.matchAll(/^version = "([^"]+)"$/gmu),
	].map((candidate) => candidate[1]);
	if (pythonVersions.length !== 1) {
		throw new Error(`${pythonPath} must declare exactly one project version.`);
	}
	return pythonVersions[0];
}

function validateInternalDependencies(manifestsByName) {
	for (const manifest of manifestsByName.values()) {
		for (const [dependencyName, declaredVersion] of Object.entries(
			manifest.dependencies ?? {},
		)) {
			const localDependency = manifestsByName.get(dependencyName);
			if (
				localDependency !== undefined &&
				declaredVersion !== localDependency.version
			) {
				throw new Error(
					`${String(manifest.name)} must depend on ${dependencyName} at the exact local version ${String(localDependency.version)}; received ${String(declaredVersion)}.`,
				);
			}
		}
	}
}

export async function createReleasePlan({ root = process.cwd(), tag } = {}) {
	const version = parseStableVersion(tag);
	const rootManifest = await readJson(resolve(root, 'package.json'));
	if (rootManifest.version !== version) {
		throw new Error(
			`package.json declares ${String(rootManifest.version)} but ${tag} requires ${version}.`,
		);
	}

	const manifests = await Promise.all(
		releaseManifestPaths.map(async (path) => ({
			path,
			manifest: await readJson(resolve(root, path)),
		})),
	);
	const manifestsByName = new Map(
		manifests.map(({ manifest }) => [manifest.name, manifest]),
	);
	validateInternalDependencies(manifestsByName);

	const npmPackages = manifests
		.filter(
			({ path, manifest }) =>
				publicManifestPaths.has(path) && manifest.version === version,
		)
		.map(({ manifest }) => manifest.name);

	const pythonPath = 'python/baron-klinecharts/pyproject.toml';
	const pyproject = await readFile(resolve(root, pythonPath), 'utf8');
	const publishPython = readPythonVersion(pyproject, pythonPath) === version;
	if (npmPackages.length === 0 && !publishPython) {
		throw new Error(`${tag} has no public release target.`);
	}

	return { version, npmPackages, publishPython };
}

export async function checkReleaseVersion(options = {}) {
	return (await createReleasePlan(options)).version;
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
		const plan = await createReleasePlan({
			tag: argumentValue('--tag') ?? process.env.GITHUB_REF_NAME,
		});
		process.stdout.write(
			process.argv.includes('--json')
				? `${JSON.stringify(plan)}\n`
				: `${plan.version}\n`,
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`Release version check failed: ${message}\n`);
		process.exitCode = 1;
	}
}
