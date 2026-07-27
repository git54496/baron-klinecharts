import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const repositoryDirectory = resolve('.');
const rootLicense = await readFile(join(repositoryDirectory, 'LICENSE'));
const rootNotice = await readFile(join(repositoryDirectory, 'NOTICE'));
const legalFiles = new Map([
	[
		'KLineCharts-LICENSE',
		await readFile(join(repositoryDirectory, 'node_modules', 'klinecharts', 'LICENSE')),
	],
	[
		'KLineCharts-NOTICE',
		await readFile(join(repositoryDirectory, 'node_modules', 'klinecharts', 'NOTICE')),
	],
	[
		'TradingView-Lightweight-Charts-LICENSE',
		await readFile(
			join(
				repositoryDirectory,
				'node_modules',
				'klinecharts',
				'licenses',
				'LICENSE-lightweight-charts',
			),
		),
	],
	[
		'Noto-Sans-SC-OFL-1.1',
		await readFile(
			join(
				repositoryDirectory,
				'node_modules',
				'@fontsource-variable',
				'noto-sans-sc',
				'LICENSE',
			),
		),
	],
]);

async function writeIfChanged(path, content) {
	let current;
	try {
		current = await readFile(path);
	} catch {
		current = undefined;
	}
	if (current === undefined || !current.equals(content)) {
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, content);
	}
}

const rootLicenses = join(repositoryDirectory, 'licenses');
await mkdir(rootLicenses, { recursive: true });
for (const [name, content] of legalFiles) {
	await writeIfChanged(join(rootLicenses, name), content);
}

for (const packageName of [
	'scene-schema',
	'klinecharts-adapter',
	'web-runtime',
	'render-runtime',
	'cli',
]) {
	const packageDirectory = join(repositoryDirectory, 'packages', packageName);
	await writeIfChanged(join(packageDirectory, 'LICENSE'), rootLicense);
	await writeIfChanged(join(packageDirectory, 'NOTICE'), rootNotice);
	const packageLicenses = join(packageDirectory, 'licenses');
	await mkdir(packageLicenses, { recursive: true });
	for (const [name, content] of legalFiles) {
		await writeIfChanged(join(packageLicenses, name), content);
	}
}

const pythonDirectory = join(repositoryDirectory, 'python', 'baron-klinecharts');
await writeIfChanged(join(pythonDirectory, 'LICENSE'), rootLicense);
await writeIfChanged(join(pythonDirectory, 'NOTICE'), rootNotice);
const pythonLicenses = join(pythonDirectory, 'licenses');
await mkdir(pythonLicenses, { recursive: true });
for (const [name, content] of legalFiles) {
	await writeIfChanged(join(pythonLicenses, name), content);
}
