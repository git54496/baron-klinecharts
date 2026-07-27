import { readSceneFile } from '../files.js';

export async function validateCommand(inputPath: string): Promise<void> {
	await readSceneFile(inputPath);
}
