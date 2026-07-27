import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryDirectory = join(packageDirectory, '..', '..');
const sourcePath = join(packageDirectory, 'generated', 'runtime-template.html');
const targetPath = join(
	repositoryDirectory,
	'python',
	'baron-klinecharts',
	'src',
	'baron_kline',
	'runtime',
	'runtime-template.html',
);
const source = await readFile(sourcePath);
let current;
try {
	current = await readFile(targetPath);
} catch {
	current = undefined;
}
if (current === undefined || !source.equals(current)) {
	await mkdir(dirname(targetPath), { recursive: true });
	await writeFile(targetPath, source);
}
