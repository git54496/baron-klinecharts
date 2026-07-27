import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDirectory = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const repositoryDirectory = join(packageDirectory, '..', '..');
const schemaDirectory = join(repositoryDirectory, 'packages', 'scene-schema');
const npmCli = process.env.npm_execpath;

if (npmCli === undefined) {
	throw new Error('verify-package.mjs must be invoked through npm.');
}

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'baron-cli-package-'));
const packDirectory = join(temporaryDirectory, 'pack');
const consumerDirectory = join(temporaryDirectory, 'consumer');

function pack(directory) {
	const output = execFileSync(
		process.execPath,
		[npmCli, 'pack', '--json', '--pack-destination', packDirectory],
		{
			cwd: directory,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'inherit'],
		},
	);
	const result = JSON.parse(output);
	return join(packDirectory, result[0].filename);
}

try {
	await mkdir(packDirectory);
	await mkdir(consumerDirectory);
	execFileSync(process.execPath, [npmCli, 'run', 'build'], {
		cwd: packageDirectory,
		stdio: 'inherit',
	});
	const schemaTarball = pack(schemaDirectory);
	const cliTarball = pack(packageDirectory);
	const manifest = JSON.parse(await readFile(join(packageDirectory, 'package.json'), 'utf8'));
	if (manifest.dependencies?.['@baron1996/klinecharts-render-runtime'] !== undefined) {
		throw new Error('Packed CLI manifest must not depend on the private Render Runtime.');
	}
	const bundle = await readFile(join(packageDirectory, 'dist', 'cli.js'), 'utf8');
	if (
		bundle.includes('@baron1996/klinecharts-render-runtime') ||
		bundle.includes('packages/render-runtime/src')
	) {
		throw new Error('CLI bundle contains a private workspace import.');
	}

	await writeFile(
		join(consumerDirectory, 'package.json'),
		'{"private":true,"type":"module"}\n',
		'utf8',
	);
	execFileSync(
		process.execPath,
		[npmCli, 'install', '--ignore-scripts', schemaTarball, cliTarball],
		{ cwd: consumerDirectory, stdio: 'inherit' },
	);
	const executable = join(consumerDirectory, 'node_modules', '.bin', 'baron-kline');
	const fixture = join(repositoryDirectory, 'tests', 'fixtures', 'scenes', 'minimal-valid.json');
	const html = join(consumerDirectory, 'scene.html');
	execFileSync(executable, ['validate', fixture], { cwd: consumerDirectory, stdio: 'inherit' });
	execFileSync(
		executable,
		['render', fixture, '--format', 'html', '--output', html],
		{ cwd: consumerDirectory, stdio: 'inherit' },
	);
	const generatedHtml = await readFile(html, 'utf8');
	if (!generatedHtml.includes('__BARON_KLINE_SCENE__')) {
		throw new Error('Packed CLI did not produce an editable standalone HTML document.');
	}
} finally {
	await rm(temporaryDirectory, { recursive: true, force: true });
}
