export const STANDARD_TOOLBAR_STYLES = String.raw`
.baron-kline-toolbar,
.baron-kline-toolbar *,
.baron-kline-toolbar-tooltip,
.baron-kline-toolbar-tooltip * {
	box-sizing: border-box;
}

.baron-kline-toolbar {
	position: relative;
	display: flex;
	width: 100%;
	max-width: 100%;
	min-width: 0;
	color: rgba(32, 35, 42, 1);
	background: rgba(255, 255, 255, 1);
	border-bottom: 1px solid rgba(218, 220, 226, 1);
	font-family: "Baron Sans", "Noto Sans SC", sans-serif;
}

.baron-kline-toolbar__viewport {
	flex: 1 1 auto;
	width: 100%;
	max-width: 100%;
	min-width: 0;
	overflow-x: auto;
	overflow-y: hidden;
	contain: layout paint;
	overscroll-behavior-x: contain;
	scrollbar-width: none;
	touch-action: pan-x;
	-webkit-overflow-scrolling: touch;
}

.baron-kline-toolbar__viewport::-webkit-scrollbar {
	display: none;
}

.baron-kline-toolbar__content {
	display: flex;
	gap: 0;
	align-items: center;
	width: max-content;
	min-width: 100%;
	min-height: 50px;
	padding: 8px;
}

.baron-kline-toolbar__group {
	display: flex;
	flex: 0 0 auto;
	gap: 2px;
	align-items: center;
}

.baron-kline-toolbar__group + .baron-kline-toolbar__group,
.baron-kline-toolbar__text-field {
	padding-left: 5px;
	margin-left: 3px;
	border-left: 1px solid rgba(217, 220, 227, 1);
}

.baron-kline-toolbar__control {
	display: grid;
	flex: 0 0 auto;
	gap: 2px;
	color: rgba(76, 82, 96, 1);
	font-size: 9px;
	line-height: 1;
}

.baron-kline-toolbar__control select,
.baron-kline-toolbar__control input {
	width: 78px;
	height: 24px;
	padding: 0 5px;
	color: rgba(32, 35, 42, 1);
	background: rgba(248, 249, 251, 1);
	border: 1px solid rgba(217, 220, 227, 1);
	border-radius: 5px;
	font: inherit;
}

.baron-kline-toolbar__control input[type="color"] {
	width: 38px;
	padding: 2px;
}

.baron-kline-toolbar__host-action {
	width: auto;
	min-width: 34px;
	padding: 0 9px;
	font: inherit;
	font-size: 11px;
}

.baron-kline-toolbar__host-action-error {
	flex: 0 0 auto;
	max-width: 260px;
	padding: 0 6px;
	color: rgba(194, 57, 52, 1);
	font-size: 11px;
	line-height: 1.35;
}

.baron-kline-toolbar__host-action-error[hidden] {
	display: none;
}

.baron-kline-toolbar__button {
	position: relative;
	display: grid;
	flex: 0 0 auto;
	width: 34px;
	height: 34px;
	padding: 0;
	place-items: center;
	color: rgba(32, 35, 42, 1);
	background: transparent;
	border: 0;
	border-radius: 8px;
	cursor: pointer;
	transition:
		color 140ms ease,
		background-color 140ms ease,
		transform 140ms ease;
}

.baron-kline-toolbar__button:hover {
	color: rgba(41, 98, 255, 1);
	background: rgba(41, 98, 255, 0.1);
	transform: translateY(-1px);
}

.baron-kline-toolbar__button:disabled {
	cursor: not-allowed;
	opacity: 0.5;
	transform: none;
}

.baron-kline-toolbar__button[aria-busy="true"]::after {
	width: 10px;
	height: 10px;
	margin-left: 5px;
	content: "";
	border: 1.5px solid currentcolor;
	border-right-color: transparent;
	border-radius: 50%;
	animation: baron-kline-toolbar-spin 700ms linear infinite;
}

@keyframes baron-kline-toolbar-spin {
	to {
		transform: rotate(360deg);
	}
}

.baron-kline-toolbar__button:focus-visible {
	outline: 2px solid rgba(41, 98, 255, 1);
	outline-offset: 2px;
}

.baron-kline-toolbar__button[aria-pressed="true"] {
	color: rgba(255, 255, 255, 1);
	background: rgba(41, 98, 255, 1);
}

.baron-kline-toolbar__button svg {
	width: 19px;
	height: 19px;
}

.baron-kline-toolbar__text-field {
	display: flex;
	flex: 0 0 auto;
	align-items: center;
}

.baron-kline-toolbar__text-input {
	width: 152px;
	height: 34px;
	padding: 0 10px;
	color: rgba(32, 35, 42, 1);
	background: rgba(248, 249, 251, 1);
	border: 1px solid rgba(217, 220, 227, 1);
	border-radius: 7px;
	font: inherit;
	font-size: 12px;
	outline: none;
	transition:
		background-color 140ms ease,
		border-color 140ms ease,
		box-shadow 140ms ease;
}

.baron-kline-toolbar__text-input::placeholder {
	color: rgba(116, 122, 136, 1);
}

.baron-kline-toolbar__text-input:hover {
	background: rgba(255, 255, 255, 1);
	border-color: rgba(184, 188, 198, 1);
}

.baron-kline-toolbar__text-input:focus {
	background: rgba(255, 255, 255, 1);
	border-color: rgba(41, 98, 255, 1);
	box-shadow: 0 0 0 2px rgba(41, 98, 255, 0.12);
}

.baron-kline-toolbar__visually-hidden {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}

.baron-kline-toolbar-tooltip {
	position: fixed;
	z-index: 10000;
	display: grid;
	gap: 3px;
	min-width: max-content;
	padding: 7px 9px;
	color: rgba(245, 247, 251, 1);
	background: rgba(24, 27, 34, 1);
	border: 1px solid rgba(255, 255, 255, 0.12);
	border-radius: 6px;
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
	opacity: 0;
	pointer-events: none;
	transform: translateY(-3px);
	transition:
		opacity 120ms ease,
		transform 120ms ease;
}

.baron-kline-toolbar-tooltip[hidden] {
	display: none;
}

.baron-kline-toolbar-tooltip--visible {
	opacity: 1;
	transform: translateY(0);
}

.baron-kline-toolbar-tooltip strong {
	font-size: 11px;
	font-weight: 650;
	line-height: 1.2;
}

.baron-kline-toolbar-tooltip code {
	color: rgba(158, 173, 209, 1);
	font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
	font-size: 8px;
	line-height: 1.2;
}

@media (max-width: 480px) {
	.baron-kline-toolbar::after {
		position: absolute;
		z-index: 2;
		top: 0;
		right: 0;
		bottom: 1px;
		width: 34px;
		background: linear-gradient(
			90deg,
			rgba(255, 255, 255, 0),
			rgba(255, 255, 255, 0.98)
		);
		content: "";
		pointer-events: none;
	}

	.baron-kline-toolbar__content {
		min-height: 48px;
		padding: 7px;
	}
}

@media (prefers-reduced-motion: reduce) {
	.baron-kline-toolbar__button,
	.baron-kline-toolbar__text-input,
	.baron-kline-toolbar-tooltip {
		transition: none;
	}
}
`;
