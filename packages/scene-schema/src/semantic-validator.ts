import type {
	ChartScene,
	SceneIndicator,
	SceneOverlay,
	ScenePane,
} from './generated/chart-scene.js';
import { SceneError, type SceneErrorCode, type SceneIssue } from './errors.js';

const INDICATOR_PARAM_COUNTS: Readonly<Record<SceneIndicator['name'], number>> = {
	MA: 4,
	EMA: 3,
	SMA: 2,
	BBI: 4,
	VOL: 3,
	MACD: 3,
	BOLL: 2,
	KDJ: 3,
	RSI: 3,
	BIAS: 3,
	BRAR: 1,
	CCI: 1,
	DMI: 2,
	CR: 5,
	PSY: 2,
	DMA: 3,
	TRIX: 2,
	OBV: 1,
	VR: 2,
	WR: 3,
	MTM: 2,
	EMV: 2,
	SAR: 3,
	AO: 2,
	ROC: 2,
	PVT: 0,
	AVP: 0,
};

const OVERLAY_BASE_KEYS = new Set([
	'id',
	'type',
	'paneId',
	'groupId',
	'visible',
	'locked',
	'zLevel',
	'mode',
	'styles',
	'metadata',
]);

function issue(code: SceneErrorCode, path: string, message: string): SceneIssue {
	return { code, path, message };
}

function assertUnique(
	values: readonly string[],
	path: string,
	label: string,
	issues: SceneIssue[],
): void {
	const seen = new Set<string>();
	for (let index = 0; index < values.length; index++) {
		const value = values[index];
		if (value !== undefined && seen.has(value)) {
			issues.push(issue('DUPLICATE_ID', `${path}/${index}`, `Duplicate ${label} ID: ${value}`));
		}
		if (value !== undefined) {
			seen.add(value);
		}
	}
}

function validateMarketData(scene: ChartScene, issues: SceneIssue[]): void {
	const candlePane = scene.panes.find((pane) => pane.kind === 'candle');
	const logarithmic = candlePane?.yAxes.some(
		(axis) => axis.role === 'primary' && axis.scale === 'logarithmic',
	) ?? false;
	let previousTimestamp = -Infinity;
	for (let index = 0; index < scene.data.length; index++) {
		const bar = scene.data[index];
		if (bar === undefined) {
			continue;
		}
		const path = `/data/${index}`;
		if (!Number.isSafeInteger(bar.timestamp)) {
			issues.push(issue('INVALID_MARKET_DATA', `${path}/timestamp`, 'Timestamp must be a safe integer.'));
		}
		if (bar.timestamp <= previousTimestamp) {
			issues.push(
				issue(
					'INVALID_MARKET_DATA',
					`${path}/timestamp`,
					'Market-data timestamps must be strictly increasing.',
				),
			);
		}
		previousTimestamp = bar.timestamp;
		if (
			bar.low > bar.high ||
			bar.open < bar.low ||
			bar.open > bar.high ||
			bar.close < bar.low ||
			bar.close > bar.high
		) {
			issues.push(
				issue(
					'INVALID_MARKET_DATA',
					path,
					'OHLC values must satisfy low <= open/close <= high.',
				),
			);
		}
		if (
			logarithmic &&
			(bar.open <= 0 || bar.high <= 0 || bar.low <= 0 || bar.close <= 0)
		) {
			issues.push(
				issue(
					'INVALID_MARKET_DATA',
					path,
					'Logarithmic candle OHLC values must all be greater than zero.',
				),
			);
		}
	}
	if (!scene.data.some((bar) => bar.timestamp === scene.viewport.anchorTimestamp)) {
		issues.push(
			issue(
				'INVALID_REFERENCE',
				'/viewport/anchorTimestamp',
				'Viewport anchorTimestamp must reference an embedded market-data bar.',
			),
		);
	}
}

function validateIndicator(
	indicator: SceneIndicator,
	pane: ScenePane,
	index: number,
	issues: SceneIssue[],
): void {
	const path = `/panes/${pane.order}/indicators/${index}`;
	if (indicator.paneId !== pane.id) {
		issues.push(
			issue('INVALID_REFERENCE', `${path}/paneId`, 'Indicator paneId must match its containing Pane.'),
		);
	}
	const axis = pane.yAxes.find((candidate) => candidate.id === indicator.yAxisId);
	if (axis === undefined) {
		issues.push(
			issue(
				'INVALID_REFERENCE',
				`${path}/yAxisId`,
				'Indicator yAxisId must reference an axis in its containing Pane.',
			),
		);
	}
	const expectedCount = INDICATOR_PARAM_COUNTS[indicator.name];
	if (indicator.name === 'MA') {
		if (
			indicator.calcParams.length < 1 ||
			indicator.calcParams.length > 8
		) {
			issues.push(
				issue(
					'SCENE_SCHEMA_INVALID',
					`${path}/calcParams`,
					'MA requires 1 to 8 calculation parameters.',
				),
			);
		}
	} else if (indicator.calcParams.length !== expectedCount) {
		issues.push(
			issue(
				'SCENE_SCHEMA_INVALID',
				`${path}/calcParams`,
				`${indicator.name} requires exactly ${expectedCount} calculation parameters.`,
			),
		);
	}
}

function validatePanes(scene: ChartScene, issues: SceneIssue[]): void {
	assertUnique(
		scene.panes.map((pane) => pane.id),
		'/panes',
		'Pane',
		issues,
	);
	const axisIds = scene.panes.flatMap((pane) => pane.yAxes.map((axis) => axis.id));
	assertUnique(axisIds, '/panes', 'Y-axis', issues);
	const indicatorIds = scene.panes.flatMap((pane) =>
		pane.indicators.map((indicator) => indicator.id),
	);
	assertUnique(indicatorIds, '/panes', 'Indicator', issues);

	const candlePanes = scene.panes.filter((pane) => pane.kind === 'candle');
	if (candlePanes.length !== 1) {
		issues.push(
			issue('INVALID_REFERENCE', '/panes', 'A Scene must contain exactly one candle Pane.'),
		);
	}

	for (let paneIndex = 0; paneIndex < scene.panes.length; paneIndex++) {
		const pane = scene.panes[paneIndex];
		if (pane === undefined) {
			continue;
		}
		const path = `/panes/${paneIndex}`;
		if (pane.order !== paneIndex) {
			issues.push(
				issue('INVALID_REFERENCE', `${path}/order`, 'Pane order must match canonical array order.'),
			);
		}
		if (pane.height < pane.minHeight) {
			issues.push(
				issue('SCENE_SCHEMA_INVALID', `${path}/height`, 'Pane height must be >= minHeight.'),
			);
		}
		assertUnique(
			pane.yAxes.map((axis) => axis.id),
			`${path}/yAxes`,
			'Y-axis',
			issues,
		);
		const primaryAxes = pane.yAxes.filter((axis) => axis.role === 'primary');
		if (primaryAxes.length !== 1) {
			issues.push(
				issue(
					'INVALID_REFERENCE',
					`${path}/yAxes`,
					'Each Pane must contain exactly one primary Y-axis.',
				),
			);
		}
		for (let axisIndex = 0; axisIndex < pane.yAxes.length; axisIndex++) {
			const axis = pane.yAxes[axisIndex];
			const axisPath = `${path}/yAxes/${axisIndex}`;
			if (axis !== undefined && axis.topGap + axis.bottomGap >= 1) {
				issues.push(
					issue(
						'SCENE_SCHEMA_INVALID',
						`${path}/yAxes/${axisIndex}`,
						'Y-axis topGap + bottomGap must be less than 1.',
					),
				);
			}
			if (axis === undefined) {
				continue;
			}
			if (scene.runtime.runtimeVersion === '0.1.0' && axis.scale !== undefined) {
				issues.push(
					issue(
						'SCENE_SCHEMA_INVALID',
						`${axisPath}/scale`,
						'Runtime 0.1.0 Y-axes must omit scale to preserve M1 canonical bytes.',
					),
				);
			}
			if (scene.runtime.runtimeVersion === '0.2.0' && axis.scale === undefined) {
				issues.push(
					issue(
						'SCENE_SCHEMA_INVALID',
						`${axisPath}/scale`,
						'Runtime 0.2.0 requires an explicit scale on every Y-axis.',
					),
				);
			}
			if (
				scene.runtime.runtimeVersion === '0.2.0' &&
				!(pane.kind === 'candle' && axis.role === 'primary') &&
				axis.scale !== 'linear'
			) {
				issues.push(
					issue(
						'SCENE_SCHEMA_INVALID',
						`${axisPath}/scale`,
						'Only the candle primary Y-axis may use logarithmic scale.',
					),
				);
			}
		}
		if (pane.kind === 'indicator') {
			if (pane.indicators.length === 0) {
				issues.push(
					issue(
						'INVALID_REFERENCE',
						`${path}/indicators`,
						'Indicator Panes cannot be empty.',
					),
				);
			}
			const primaryAxisId = primaryAxes[0]?.id;
			if (
				primaryAxisId !== undefined &&
				!pane.indicators.some((indicator) => indicator.yAxisId === primaryAxisId)
			) {
				issues.push(
					issue(
						'INVALID_REFERENCE',
						`${path}/indicators`,
						'An Indicator Pane must contain an Indicator on its primary Y-axis.',
					),
				);
			}
		}
		for (let indicatorIndex = 0; indicatorIndex < pane.indicators.length; indicatorIndex++) {
			const indicator = pane.indicators[indicatorIndex];
			if (indicator !== undefined) {
				validateIndicator(indicator, pane, indicatorIndex, issues);
			}
		}
	}
}

function requireOverlayKeys(
	overlay: SceneOverlay,
	path: string,
	required: readonly string[],
	issues: SceneIssue[],
): void {
	const allowed = new Set([...OVERLAY_BASE_KEYS, ...required]);
	for (const requiredKey of required) {
		if (!(requiredKey in overlay)) {
			issues.push(
				issue(
					'SCENE_SCHEMA_INVALID',
					`${path}/${requiredKey}`,
					`${overlay.type} requires ${requiredKey}.`,
				),
			);
		}
	}
	for (const key of Object.keys(overlay)) {
		if (!allowed.has(key)) {
			issues.push(
				issue(
					'SCENE_SCHEMA_INVALID',
					`${path}/${key}`,
					`${overlay.type} does not allow ${key}.`,
				),
			);
		}
	}
}

function validateOverlayShape(overlay: SceneOverlay, path: string, issues: SceneIssue[]): void {
	switch (overlay.type) {
		case 'horizontalStraightLine':
			requireOverlayKeys(overlay, path, ['anchor'], issues);
			if (overlay.anchor === undefined || !('value' in overlay.anchor)) {
				issues.push(issue('SCENE_SCHEMA_INVALID', `${path}/anchor`, 'A value anchor is required.'));
			} else if (Object.keys(overlay.anchor).length !== 1) {
				issues.push(
					issue(
						'SCENE_SCHEMA_INVALID',
						`${path}/anchor`,
						'horizontalStraightLine anchor must contain only value.',
					),
				);
			}
			break;
		case 'priceLine':
			requireOverlayKeys(overlay, path, ['anchor'], issues);
			if (overlay.anchor === undefined || !('value' in overlay.anchor)) {
				issues.push(issue('SCENE_SCHEMA_INVALID', `${path}/anchor`, 'A value anchor is required.'));
			}
			break;
		case 'verticalStraightLine':
			requireOverlayKeys(overlay, path, ['anchor'], issues);
			if (overlay.anchor === undefined || !('timestamp' in overlay.anchor)) {
				issues.push(issue('SCENE_SCHEMA_INVALID', `${path}/anchor`, 'A time anchor is required.'));
			}
			break;
		case 'horizontalRayLine':
		case 'horizontalSegment':
			requireOverlayKeys(overlay, path, ['value', 'startTimestamp', 'endTimestamp'], issues);
			break;
		case 'verticalRayLine':
		case 'verticalSegment':
			requireOverlayKeys(overlay, path, ['timestamp', 'startValue', 'endValue'], issues);
			break;
		case 'rayLine':
		case 'segment':
		case 'straightLine':
		case 'fibonacciLine':
			requireOverlayKeys(overlay, path, ['points'], issues);
			if (overlay.points?.length !== 2) {
				issues.push(issue('SCENE_SCHEMA_INVALID', `${path}/points`, 'Exactly two points are required.'));
			}
			break;
		case 'priceChannelLine':
		case 'parallelStraightLine':
			requireOverlayKeys(overlay, path, ['points'], issues);
			if (overlay.points?.length !== 3) {
				issues.push(
					issue('SCENE_SCHEMA_INVALID', `${path}/points`, 'Exactly three points are required.'),
				);
			}
			break;
		case 'brush':
			requireOverlayKeys(overlay, path, ['points'], issues);
			if ((overlay.points?.length ?? 0) < 2) {
				issues.push(
					issue('SCENE_SCHEMA_INVALID', `${path}/points`, 'Brush requires at least two points.'),
				);
			}
			break;
		case 'simpleTag':
			requireOverlayKeys(overlay, path, ['anchor', 'text'], issues);
			if (overlay.anchor === undefined || !('value' in overlay.anchor)) {
				issues.push(issue('SCENE_SCHEMA_INVALID', `${path}/anchor`, 'A value anchor is required.'));
			}
			break;
		case 'simpleAnnotation':
		case 'callout':
		case 'text':
			requireOverlayKeys(overlay, path, ['point', 'text'], issues);
			break;
		case 'rectangle':
		case 'arrow':
			requireOverlayKeys(overlay, path, ['start', 'end'], issues);
			break;
		case 'priceMeasurement':
			requireOverlayKeys(overlay, path, ['start', 'end'], issues);
			break;
		case 'crossLine':
			requireOverlayKeys(overlay, path, ['point'], issues);
			break;
	}
}

function validateOverlays(scene: ChartScene, issues: SceneIssue[]): void {
	assertUnique(
		scene.overlays.map((overlay) => overlay.id),
		'/overlays',
		'Overlay',
		issues,
	);
	const paneIds = new Set(scene.panes.map((pane) => pane.id));
	const candlePane = scene.panes.find((pane) => pane.kind === 'candle');
	const candlePaneId = candlePane?.id;
	const logarithmic = candlePane?.yAxes.some(
		(axis) => axis.role === 'primary' && axis.scale === 'logarithmic',
	) ?? false;
	const timestamps = new Set(scene.data.map((bar) => bar.timestamp));
	for (let index = 0; index < scene.overlays.length; index++) {
		const overlay = scene.overlays[index];
		if (overlay === undefined) {
			continue;
		}
		const path = `/overlays/${index}`;
		if (!paneIds.has(overlay.paneId)) {
			issues.push(
				issue('INVALID_REFERENCE', `${path}/paneId`, 'Overlay paneId does not exist.'),
			);
		}
		validateOverlayShape(overlay, path, issues);
		if (scene.runtime.runtimeVersion === '0.1.0' && overlay.type === 'priceMeasurement') {
			issues.push(
				issue(
					'SCENE_SCHEMA_INVALID',
					`${path}/type`,
					'Runtime 0.1.0 does not support priceMeasurement.',
				),
			);
		}
		for (const coordinate of overlayPriceCoordinates(overlay, path)) {
			if (
				(overlay.type === 'priceMeasurement' ||
					(logarithmic && overlay.paneId === candlePaneId)) &&
				coordinate.value <= 0
			) {
				issues.push(
					issue(
						'SCENE_SCHEMA_INVALID',
						coordinate.path,
						overlay.type === 'priceMeasurement'
							? 'priceMeasurement values must be greater than zero.'
							: 'Logarithmic Overlay price coordinates must be greater than zero.',
					),
				);
			}
		}
		if (overlay.type === 'priceMeasurement') {
			for (const key of ['start', 'end'] as const) {
				const point = overlay[key];
				if (point !== undefined && !timestamps.has(point.timestamp)) {
					issues.push(
						issue(
							'INVALID_REFERENCE',
							`${path}/${key}/timestamp`,
							'priceMeasurement timestamps must reference embedded market-data bars.',
						),
					);
				}
			}
		}
	}
}

interface OverlayPriceCoordinate {
	readonly path: string;
	readonly value: number;
}

function overlayPriceCoordinates(
	overlay: SceneOverlay,
	path: string,
): readonly OverlayPriceCoordinate[] {
	const result: OverlayPriceCoordinate[] = [];
	const add = (value: number | undefined, valuePath: string): void => {
		if (value !== undefined) {
			result.push({ path: valuePath, value });
		}
	};
	switch (overlay.type) {
		case 'horizontalStraightLine':
		case 'priceLine':
		case 'simpleTag': {
			const anchor = overlay.anchor;
			add(anchor !== undefined && 'value' in anchor ? anchor.value : undefined, `${path}/anchor/value`);
			break;
		}
		case 'horizontalRayLine':
		case 'horizontalSegment':
			add(overlay.value, `${path}/value`);
			break;
		case 'verticalRayLine':
		case 'verticalSegment':
			add(overlay.startValue, `${path}/startValue`);
			add(overlay.endValue, `${path}/endValue`);
			break;
		case 'rayLine':
		case 'segment':
		case 'straightLine':
		case 'fibonacciLine':
		case 'priceChannelLine':
		case 'parallelStraightLine':
		case 'brush':
			for (let index = 0; index < (overlay.points?.length ?? 0); index++) {
				add(overlay.points?.[index]?.value, `${path}/points/${index}/value`);
			}
			break;
		case 'simpleAnnotation':
		case 'crossLine':
		case 'callout':
		case 'text':
			add(overlay.point?.value, `${path}/point/value`);
			break;
		case 'rectangle':
		case 'arrow':
		case 'priceMeasurement':
			add(overlay.start?.value, `${path}/start/value`);
			add(overlay.end?.value, `${path}/end/value`);
			break;
		case 'verticalStraightLine':
			break;
	}
	return result;
}

export function collectSemanticIssues(scene: ChartScene): readonly SceneIssue[] {
	const issues: SceneIssue[] = [];
	validateMarketData(scene, issues);
	validatePanes(scene, issues);
	validateOverlays(scene, issues);
	return issues;
}

export function assertSemanticScene(scene: ChartScene): void {
	const issues = collectSemanticIssues(scene);
	const first = issues[0];
	if (first !== undefined) {
		throw new SceneError(first.code, first.path, first.message, issues);
	}
}
