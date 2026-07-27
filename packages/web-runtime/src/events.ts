import type {
	KLineSceneRuntimeEvent,
	KLineSceneRuntimeListener,
} from './types.js';

/** 只分发可结构化克隆的场景事件。 */
export class RuntimeEventBus {
	readonly #listeners = new Set<KLineSceneRuntimeListener>();

	public subscribe(listener: KLineSceneRuntimeListener): () => void {
		this.#listeners.add(listener);
		return () => {
			this.#listeners.delete(listener);
		};
	}

	public emit(event: KLineSceneRuntimeEvent): void {
		for (const listener of this.#listeners) {
			listener(structuredClone(event));
		}
	}

	public clear(): void {
		this.#listeners.clear();
	}
}
