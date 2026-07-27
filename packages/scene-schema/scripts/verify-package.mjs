import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDirectory = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const repositoryDirectory = join(packageDirectory, '..', '..');
const npmCli = process.env.npm_execpath;

if (npmCli === undefined) {
	throw new Error('verify-package.mjs must be invoked through npm.');
}

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'baron-scene-package-'));
const packDirectory = join(temporaryDirectory, 'pack');
const consumerDirectory = join(temporaryDirectory, 'consumer');

try {
	await mkdir(packDirectory);
	await mkdir(consumerDirectory);
	execFileSync(process.execPath, [npmCli, 'run', 'build'], {
		cwd: packageDirectory,
		stdio: 'inherit',
	});
	const packOutput = execFileSync(
		process.execPath,
		[npmCli, 'pack', '--json', '--pack-destination', packDirectory],
		{
			cwd: packageDirectory,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'inherit'],
		},
	);
	const packResult = JSON.parse(packOutput);
	const tarball = join(packDirectory, packResult[0].filename);

	await writeFile(
		join(temporaryDirectory, 'package.json'),
		'{"private":true,"type":"module"}\n',
		'utf8',
	);
	await writeFile(
		join(temporaryDirectory, 'verify.mjs'),
		[
			"import { ChartSceneSchema, parseChartScene } from '@baron1996/kline-scene-schema';",
			"import { readFile } from 'node:fs/promises';",
			'const scene = JSON.parse(await readFile(process.argv[2], "utf8"));',
			"if (ChartSceneSchema.title !== 'ChartScene') throw new Error('Schema export missing.');",
			"if (parseChartScene(scene).schema !== '@baron1996/kline-scene') throw new Error('Parser failed.');",
			'',
		].join('\n'),
		'utf8',
	);
	execFileSync(process.execPath, [npmCli, 'install', '--ignore-scripts', tarball], {
		cwd: temporaryDirectory,
		stdio: 'inherit',
	});
	execFileSync(
		process.execPath,
		[
			join(temporaryDirectory, 'verify.mjs'),
			join(repositoryDirectory, 'tests', 'fixtures', 'scenes', 'minimal-valid.json'),
		],
		{
			cwd: consumerDirectory,
			stdio: 'inherit',
		},
	);
} finally {
	await rm(temporaryDirectory, { recursive: true, force: true });
}
