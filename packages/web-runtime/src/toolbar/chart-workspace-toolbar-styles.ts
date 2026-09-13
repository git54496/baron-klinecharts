export const CHART_WORKSPACE_TOOLBAR_STYLES = String.raw`
.baron-chart-workspace-toolbar,
.baron-chart-workspace-toolbar *,
.baron-chart-workspace-popover,
.baron-chart-workspace-popover *,
.baron-chart-workspace-tooltip,
.baron-chart-workspace-tooltip * { box-sizing: border-box; }

.baron-chart-workspace-toolbar {
	display: flex;
	color: rgba(42, 46, 57, 1);
	background: rgba(255, 255, 255, 1);
	font-family: "Baron Sans", "Noto Sans SC", system-ui, sans-serif;
}

.baron-chart-workspace-toolbar.baron-chart-workspace-toolbar--top {
	align-items: center;
	flex-wrap: nowrap;
	width: 100%;
	max-width: 100%;
	min-width: 0;
	min-height: 44px;
	height: auto;
	padding: 5px 8px;
	border-bottom: 1px solid rgba(229, 231, 235, 1);
	overflow-x: auto;
	overflow-y: hidden;
	overscroll-behavior-x: contain;
	scrollbar-width: none;
	touch-action: pan-x pan-y;
	-webkit-overflow-scrolling: touch;
}

.baron-chart-workspace-toolbar--top::-webkit-scrollbar,
.baron-chart-workspace-toolbar--left::-webkit-scrollbar { display: none; }

.baron-chart-workspace-toolbar--left {
	flex-direction: column;
	align-items: center;
	width: 44px;
	height: 100%;
	min-height: 0;
	padding: 6px 5px;
	border-right: 1px solid rgba(229, 231, 235, 1);
	overflow-x: hidden;
	overflow-y: auto;
	scrollbar-width: none;
}

.baron-chart-workspace-toolbar__section {
	display: flex;
	flex: 0 0 auto;
	align-items: center;
	gap: 2px;
}

.baron-chart-workspace-toolbar--left .baron-chart-workspace-toolbar__section {
	flex-direction: column;
	width: 100%;
	padding: 4px 0;
}

.baron-chart-workspace-toolbar--left .baron-chart-workspace-toolbar__section +
.baron-chart-workspace-toolbar__section {
	border-top: 1px solid rgba(237, 238, 242, 1);
}

.baron-chart-workspace-toolbar__section--end { margin-left: auto; }

.baron-chart-workspace-toolbar__button {
	display: inline-flex;
	flex: 0 0 auto;
	align-items: center;
	justify-content: center;
	min-width: 32px;
	height: 32px;
	padding: 0 9px;
	color: rgba(70, 75, 88, 1);
	background: transparent;
	border: 0;
	border-radius: 6px;
	font: inherit;
	font-size: 12px;
	font-weight: 500;
	cursor: pointer;
	transition: color 120ms ease, background-color 120ms ease;
}

.baron-chart-workspace-toolbar--left .baron-chart-workspace-toolbar__button {
	width: 32px;
	padding: 0;
}

.baron-chart-workspace-toolbar__button:hover:not(:disabled),
.baron-chart-workspace-toolbar__button[aria-expanded="true"] {
	color: rgba(41, 98, 255, 1);
	background: rgba(41, 98, 255, .08);
}

.baron-chart-workspace-toolbar__button[aria-pressed="true"] {
	color: rgba(41, 98, 255, 1);
	background: rgba(41, 98, 255, .12);
}

.baron-chart-workspace-toolbar__button:focus-visible,
.baron-chart-workspace-toolbar__select:focus-visible {
	outline: 2px solid rgba(41, 98, 255, .9);
	outline-offset: 1px;
}

.baron-chart-workspace-toolbar__button:disabled,
.baron-chart-workspace-toolbar__select:disabled {
	cursor: not-allowed;
	opacity: .42;
}

.baron-chart-workspace-toolbar__button[aria-busy="true"]::after {
	width: 9px;
	height: 9px;
	margin-left: 6px;
	content: "";
	border: 1.5px solid currentcolor;
	border-right-color: transparent;
	border-radius: 50%;
	animation: baron-workspace-spin 700ms linear infinite;
}

.baron-chart-workspace-toolbar__button svg { width: 18px; height: 18px; }
.baron-chart-workspace-toolbar__period { min-width: 38px; }
.baron-chart-workspace-toolbar__divider { width: 1px; height: 20px; margin: 0 5px; background: rgba(229, 231, 235, 1); }

.baron-chart-workspace-toolbar__timezone {
	position: relative;
	display: inline-flex;
	flex: 0 0 auto;
	align-items: center;
	gap: 5px;
	min-width: 64px;
	height: 28px;
	padding: 0 10px;
	color: rgba(70, 75, 88, 1);
	background: rgba(247, 248, 250, 1);
	border: 1px solid rgba(226, 228, 233, 1);
	border-radius: 999px;
	cursor: pointer;
	overflow: hidden;
}

.baron-chart-workspace-toolbar__timezone:focus-within {
	outline: 2px solid rgba(41, 98, 255, .9);
	outline-offset: 1px;
}
.baron-chart-workspace-toolbar__timezone svg {
	flex: 0 0 auto;
	width: 16px;
	height: 16px;
}
.baron-chart-workspace-toolbar__timezone-value {
	font-size: 11px;
	font-weight: 500;
	line-height: 1;
	white-space: nowrap;
}
.baron-chart-workspace-toolbar__select {
	max-width: 164px;
	height: 30px;
	padding: 0 24px 0 4px;
	color: inherit;
	background: transparent;
	border: 0;
	font: inherit;
	font-size: 11px;
	cursor: pointer;
}
.baron-chart-workspace-toolbar__timezone .baron-chart-workspace-toolbar__timezone-select {
	position: absolute;
	inset: 0;
	width: 100%;
	max-width: none;
	height: 100%;
	padding: 0;
	opacity: 0;
}

.baron-chart-workspace-toolbar__section--settings { gap: 6px; }
.baron-chart-workspace-toolbar__setting {
	position: relative;
	display: inline-flex;
	flex: 0 0 auto;
	align-items: center;
	height: 32px;
}
.baron-chart-workspace-toolbar__setting-control {
	display: inline-flex;
	align-items: center;
	min-width: 0;
	gap: 4px;
}
.baron-chart-workspace-toolbar__segmented {
	display: inline-flex;
	flex: 0 0 auto;
	align-items: center;
	padding: 1px;
	background: rgba(244, 246, 249, 1);
	border: 1px solid rgba(226, 228, 233, 1);
	border-radius: 6px;
}
.baron-chart-workspace-toolbar__segmented .baron-chart-workspace-toolbar__segment {
	min-width: 34px;
	height: 26px;
	padding: 0 7px;
	border-radius: 5px;
	font-size: 11px;
}
.baron-chart-workspace-toolbar__drawing-indicator {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 11px;
	height: 11px;
	margin-left: 3px;
	color: currentcolor;
}
.baron-chart-workspace-toolbar__drawing-indicator[hidden] { display: none; }
.baron-chart-workspace-toolbar__drawing-indicator svg { width: 11px; height: 11px; }
.baron-chart-workspace-toolbar__setting .baron-chart-workspace-toolbar__select {
	max-width: 104px;
	background: rgba(247, 248, 250, 1);
	border: 1px solid rgba(226, 228, 233, 1);
	border-radius: 6px;
}
.baron-chart-workspace-toolbar__setting .baron-chart-workspace-toolbar__error:not([hidden]) {
	position: absolute;
	z-index: 10000;
	top: calc(100% + 5px);
	right: 0;
	width: max-content;
	max-width: 240px;
	padding: 7px 9px;
	background: rgba(255, 255, 255, .99);
	border: 1px solid rgba(218, 220, 226, 1);
	border-radius: 6px;
	box-shadow: 0 8px 24px rgba(20, 23, 31, .14);
}

.baron-chart-workspace-popover {
	position: fixed;
	z-index: 10000;
	min-width: 220px;
	padding: 10px;
	color: rgba(42, 46, 57, 1);
	background: rgba(255, 255, 255, .99);
	border: 1px solid rgba(218, 220, 226, 1);
	border-radius: 9px;
	box-shadow: 0 12px 32px rgba(20, 23, 31, .16);
	opacity: 0;
	transform: translateY(-4px);
	transition: opacity 120ms ease, transform 120ms ease;
}

.baron-chart-workspace-popover[hidden] { display: none; }
.baron-chart-workspace-popover--open { opacity: 1; transform: translateY(0); }
.baron-chart-workspace-popover__title { margin: 2px 4px 8px; color: rgba(102, 108, 122, 1); font-size: 11px; font-weight: 600; }
.baron-chart-workspace-popover__title--secondary { margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(231, 233, 238, 1); }
.baron-chart-workspace-popover__grid { display: grid; grid-template-columns: repeat(3, minmax(58px, 1fr)); gap: 5px; }
.baron-chart-workspace-popover__grid--secondary { grid-template-columns: repeat(2, minmax(82px, 1fr)); }
.baron-chart-workspace-popover__grid .baron-chart-workspace-toolbar__button { width: 100%; border: 1px solid rgba(231, 233, 238, 1); }
.baron-chart-workspace-popover__settings-list { display: flex; flex-wrap: wrap; gap: 5px; }
.baron-chart-workspace-popover__settings-list:empty { display: none; }
.baron-chart-workspace-popover__settings-list .baron-chart-workspace-toolbar__button { border: 1px solid rgba(231, 233, 238, 1); font-size: 11px; }
.baron-indicator-settings { box-sizing: border-box; width: min(360px, calc(100vw - 24px)); max-height: min(640px, calc(100vh - 24px)); padding: 22px; overflow: auto; color: #000; background: #fff; border: 1px solid #eaebed; border-radius: 20px; box-shadow: 0 18px 54px rgba(20, 23, 31, .16); font: inherit; }
.baron-indicator-settings::backdrop { background: rgba(20, 23, 31, .32); }
.baron-indicator-settings h2 { margin: 0; font-size: 18px; line-height: 25px; font-weight: 800; }
.baron-indicator-settings p { margin: 5px 0 0; color: #888; font-size: 12px; line-height: 16px; }
.baron-indicator-settings__fields { display: grid; gap: 12px; margin-top: 20px; }
.baron-indicator-settings__fields label { display: grid; gap: 6px; color: #000; font-size: 12px; line-height: 16px; font-weight: 700; }
.baron-indicator-settings__fields input { box-sizing: border-box; width: 100%; height: 36px; padding: 0 10px; color: #000; background: #fafafa; border: 1px solid #eaebed; border-radius: 10px; font: inherit; font-size: 14px; font-variant-numeric: tabular-nums; }
.baron-indicator-settings__error { min-height: 16px; color: #e40014 !important; }
.baron-indicator-settings__actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
.baron-indicator-settings__actions button { min-height: 36px; padding: 0 12px; border: 1px solid #eaebed; border-radius: 12px; color: #000; background: #fff; font: inherit; font-size: 12px; font-weight: 800; cursor: pointer; }
.baron-indicator-settings__actions button[type=submit] { border-color: #0b6df2; color: #fff; background: #0b6df2; }
.baron-indicator-settings button:focus-visible, .baron-indicator-settings input:focus-visible, .baron-chart-workspace-popover__settings-list button:focus-visible { outline: 2px solid #0b6df2; outline-offset: 2px; }
.baron-chart-workspace-popover__group + .baron-chart-workspace-popover__group { padding-top: 10px; margin-top: 10px; border-top: 1px solid rgba(233, 235, 239, 1); }
.baron-chart-workspace-popover__text-form { display: flex; gap: 6px; }
.baron-chart-workspace-popover__text-form input {
	width: 180px;
	height: 32px;
	padding: 0 9px;
	color: rgba(42, 46, 57, 1);
	background: rgba(247, 248, 250, 1);
	border: 1px solid rgba(226, 228, 233, 1);
	border-radius: 6px;
	font: inherit;
	font-size: 12px;
}
.baron-chart-workspace-popover__text-form input:focus { border-color: rgba(41, 98, 255, 1); outline: 2px solid rgba(41, 98, 255, .12); }
.baron-chart-workspace-popover__text-form .baron-chart-workspace-toolbar__button { color: rgba(255, 255, 255, 1); background: rgba(41, 98, 255, 1); }
.baron-chart-workspace-toolbar__error { max-width: 260px; padding: 5px 4px 0; color: rgba(194, 57, 52, 1); font-size: 11px; line-height: 1.35; }
.baron-chart-workspace-toolbar__error[hidden] { display: none; }

.baron-chart-workspace-tooltip {
	position: fixed;
	z-index: 10001;
	padding: 6px 8px;
	color: rgba(248, 249, 252, 1);
	background: rgba(31, 34, 42, .96);
	border-radius: 5px;
	font: 500 11px/1.25 "Baron Sans", "Noto Sans SC", system-ui, sans-serif;
	pointer-events: none;
}
.baron-chart-workspace-tooltip[hidden] { display: none; }

@keyframes baron-workspace-spin { to { transform: rotate(360deg); } }

@media (max-width: 640px) {
	.baron-chart-workspace-toolbar.baron-chart-workspace-toolbar--top { min-height: 42px; padding: 5px 4px; }
	.baron-chart-workspace-toolbar__select { max-width: 112px; }
	.baron-chart-workspace-toolbar__section--settings { gap: 4px; }
	.baron-chart-workspace-toolbar__setting { gap: 3px; }
}

@media (prefers-reduced-motion: reduce) {
	.baron-chart-workspace-toolbar__button,
	.baron-chart-workspace-popover,
	.baron-chart-workspace-toolbar__segment { transition: none; }
}
`;
