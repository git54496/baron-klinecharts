import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

import {
	createKLineSceneRuntime,
	createStandardToolbar,
} from '@baron1996/klinecharts-runtime';
import scene from '../../tests/fixtures/scenes/all-overlays.json';

import '../shared.css';

function ChartExample() {
	const chartRef = useRef<HTMLDivElement>(null);
	const toolbarRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		let cancelled = false;
		let cleanup = () => {};
		void (async () => {
			if (chartRef.current === null || toolbarRef.current === null) {
				return;
			}
			const runtime = await createKLineSceneRuntime(chartRef.current, scene);
			if (cancelled) {
				runtime.destroy();
				return;
			}
			const toolbar = createStandardToolbar(toolbarRef.current, runtime);
			cleanup = () => {
				toolbar.destroy();
				runtime.destroy();
			};
		})();
		return () => {
			cancelled = true;
			cleanup();
		};
	}, []);

	return (
		<>
			<div ref={toolbarRef} className="toolbar" />
			<div ref={chartRef} className="chart" />
		</>
	);
}

const rootElement = document.querySelector('#root');
if (rootElement === null) {
	throw new Error('React root is missing.');
}
createRoot(rootElement).render(<ChartExample />);
