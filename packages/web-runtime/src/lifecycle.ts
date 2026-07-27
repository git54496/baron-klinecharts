type Teardown = () => void;

const teardowns = new WeakMap<object, Set<Teardown>>();

export function registerRuntimeTeardown(runtime: object, teardown: Teardown): () => void {
	let values = teardowns.get(runtime);
	if (values === undefined) {
		values = new Set();
		teardowns.set(runtime, values);
	}
	values.add(teardown);
	return () => {
		values?.delete(teardown);
	};
}

export function runRuntimeTeardowns(runtime: object): void {
	const values = teardowns.get(runtime);
	if (values === undefined) {
		return;
	}
	for (const teardown of [...values]) {
		teardown();
	}
	values.clear();
	teardowns.delete(runtime);
}
