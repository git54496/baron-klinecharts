export const TIME_SERIES_RUNTIME_STYLES = String.raw`
.baron-time-series-runtime,
.baron-time-series-runtime * {
	box-sizing: border-box;
}

.baron-time-series-runtime {
	position: absolute;
	inset: 0;
	z-index: 20;
	color: var(--baron-time-series-text);
	font-family: var(--baron-time-series-font);
	pointer-events: none;
}

.baron-time-series-runtime__legend {
	position: absolute;
	top: 12px;
	left: 12px;
	display: flex;
	flex-wrap: wrap;
	gap: 7px;
	max-width: calc(100% - 24px);
	pointer-events: auto;
}

.baron-time-series-runtime__legend-button {
	display: inline-flex;
	gap: 7px;
	align-items: center;
	min-height: 28px;
	padding: 5px 10px;
	color: inherit;
	background: color-mix(in srgb, var(--baron-time-series-background) 86%, transparent);
	border: 1px solid color-mix(in srgb, var(--baron-time-series-text) 18%, transparent);
	border-radius: 999px;
	font: inherit;
	cursor: pointer;
	backdrop-filter: blur(6px);
}

.baron-time-series-runtime__legend-button[aria-pressed="false"] {
	opacity: 0.45;
}

.baron-time-series-runtime__legend-button:focus-visible {
	outline: 2px solid currentColor;
	outline-offset: 2px;
}

.baron-time-series-runtime__swatch {
	width: 16px;
	height: 3px;
	background: var(--baron-time-series-color);
	border-radius: 2px;
}

.baron-time-series-runtime__tooltip {
	position: absolute;
	top: 52px;
	left: 12px;
	display: grid;
	gap: 5px;
	min-width: 178px;
	padding: 9px 11px;
	color: var(--baron-time-series-text);
	background: color-mix(in srgb, var(--baron-time-series-background) 90%, transparent);
	border: 1px solid color-mix(in srgb, var(--baron-time-series-text) 18%, transparent);
	border-radius: 9px;
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
	backdrop-filter: blur(8px);
}

.baron-time-series-runtime__tooltip[hidden] {
	display: none;
}

.baron-time-series-runtime__tooltip-time {
	margin-bottom: 2px;
	font-weight: 650;
}

.baron-time-series-runtime__tooltip-row {
	display: flex;
	gap: 14px;
	justify-content: space-between;
}

.baron-time-series-runtime__tooltip-name {
	display: inline-flex;
	gap: 7px;
	align-items: center;
}

.baron-time-series-runtime__tooltip-value {
	font-variant-numeric: tabular-nums;
}
`;
