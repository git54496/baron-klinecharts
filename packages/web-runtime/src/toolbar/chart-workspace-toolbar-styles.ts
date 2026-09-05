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

.baron-chart-workspace-toolbar--top {
	align-items: center;
	width: 100%;
	min-width: 0;
	height: 44px;
	padding: 0 8px;
	border-bottom: 1px solid rgba(229, 231, 235, 1);
	overflow-x: auto;
	overflow-y: hidden;
	scrollbar-width: none;
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
	display: flex;
	align-items: center;
	gap: 3px;
	height: 32px;
	padding-left: 7px;
	color: rgba(70, 75, 88, 1);
}

.baron-chart-workspace-toolbar__timezone svg { width: 16px; height: 16px; }
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
.baron-chart-workspace-popover__grid { display: grid; grid-template-columns: repeat(3, minmax(58px, 1fr)); gap: 5px; }
.baron-chart-workspace-popover__grid .baron-chart-workspace-toolbar__button { width: 100%; border: 1px solid rgba(231, 233, 238, 1); }
.baron-chart-workspace-popover__group + .baron-chart-workspace-popover__group { padding-top: 10px; margin-top: 10px; border-top: 1px solid rgba(233, 235, 239, 1); }
.baron-chart-workspace-popover__row { display: grid; grid-template-columns: 76px minmax(120px, 1fr); align-items: center; gap: 10px; min-height: 34px; }
.baron-chart-workspace-popover__label { color: rgba(102, 108, 122, 1); font-size: 11px; }
.baron-chart-workspace-popover__row .baron-chart-workspace-toolbar__select { width: 100%; max-width: none; background: rgba(247, 248, 250, 1); border: 1px solid rgba(226, 228, 233, 1); border-radius: 6px; }
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
	.baron-chart-workspace-toolbar--top { height: 42px; padding: 0 4px; }
	.baron-chart-workspace-toolbar__timezone { padding-left: 3px; }
	.baron-chart-workspace-toolbar__select { max-width: 112px; }
}

@media (prefers-reduced-motion: reduce) {
	.baron-chart-workspace-toolbar__button,
	.baron-chart-workspace-popover { transition: none; }
}
`;
