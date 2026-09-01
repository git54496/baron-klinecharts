import type {
	DataLoader,
	DataLoaderGetBarsParams,
	KLineData,
} from 'klinecharts';

export type StaticDataLoadType = DataLoaderGetBarsParams['type'];

/** 创建只读取场景内嵌行情的不可变数据加载器。 */
export function createStaticDataLoader(data: readonly KLineData[]): DataLoader {
	const snapshot = structuredClone(data) as KLineData[];
	return {
		getBars({ type, callback }): void {
			callback(type === 'init' ? structuredClone(snapshot) : [], {
				forward: false,
				backward: false,
			});
		},
	};
}
