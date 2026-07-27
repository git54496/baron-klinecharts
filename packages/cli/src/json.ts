function sortJson(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map((item) => sortJson(item));
	}
	if (value !== null && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.filter(([, child]) => child !== undefined)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, child]) => [key, sortJson(child)]),
		);
	}
	return value;
}

export function formatJson(value: unknown): string {
	return `${JSON.stringify(sortJson(value))}\n`;
}
