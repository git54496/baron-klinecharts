import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryDirectory = join(packageDirectory, '..', '..');
const sourceDirectory = join(packageDirectory, 'schema');
const targetDirectory = join(
	repositoryDirectory,
	'python',
	'baron-klinecharts',
	'src',
	'baron_kline',
	'schemas',
);

await mkdir(targetDirectory, { recursive: true });
for (const name of (await readdir(sourceDirectory)).filter((value) => value.endsWith('.json')).sort()) {
	const source = await readFile(join(sourceDirectory, name));
	let current;
	try {
		current = await readFile(join(targetDirectory, name));
	} catch {
		current = undefined;
	}
	if (current === undefined || !source.equals(current)) {
		await writeFile(join(targetDirectory, name), source);
	}
}
