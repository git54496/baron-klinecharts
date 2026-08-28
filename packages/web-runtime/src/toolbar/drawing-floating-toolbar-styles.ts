export const DRAWING_FLOATING_TOOLBAR_STYLES = String.raw`
.baron-drawing-toolbar,
.baron-drawing-toolbar * {
	box-sizing: border-box;
}

.baron-drawing-toolbar {
	position: fixed;
	z-index: 9998;
	display: flex;
	align-items: center;
	min-height: 48px;
	padding: 5px 7px 5px 4px;
	color: rgba(32, 35, 42, 1);
	background: rgba(255, 255, 255, 0.98);
	border: 1px solid rgba(218, 220, 226, 1);
	border-radius: 12px;
	box-shadow:
		0 2px 5px rgba(20, 29, 48, 0.08),
		0 10px 28px rgba(20, 29, 48, 0.13);
	font-family: "Baron Sans", "Noto Sans SC", sans-serif;
	font-size: 12px;
	line-height: 1;
	user-select: none;
	transition:
		opacity 120ms ease,
		box-shadow 120ms ease;
}

.baron-drawing-toolbar[hidden] {
	display: none;
}

.baron-drawing-toolbar[data-dragging="true"] {
	box-shadow:
		0 3px 8px rgba(20, 29, 48, 0.12),
		0 16px 40px rgba(20, 29, 48, 0.18);
}

.baron-drawing-toolbar__grip {
	display: grid;
	flex: 0 0 auto;
	grid-template-columns: repeat(2, 3px);
	gap: 3px;
	width: 24px;
	height: 36px;
	padding: 8px 6px;
	place-content: center;
	color: rgba(153, 158, 170, 1);
	background: transparent;
	border: 0;
	border-radius: 7px;
	cursor: grab;
	touch-action: none;
}

.baron-drawing-toolbar__grip:active {
	cursor: grabbing;
}

.baron-drawing-toolbar__grip-dot {
	width: 3px;
	height: 3px;
	background: currentcolor;
	border-radius: 50%;
}

.baron-drawing-toolbar__type,
.baron-drawing-toolbar__button,
.baron-drawing-toolbar__control {
	position: relative;
	display: grid;
	flex: 0 0 auto;
	height: 36px;
	place-items: center;
	color: rgba(32, 35, 42, 1);
	background: transparent;
	border: 0;
	border-radius: 8px;
}

.baron-drawing-toolbar__type,
.baron-drawing-toolbar__button {
	width: 38px;
}

.baron-drawing-toolbar__type {
	color: rgba(62, 68, 80, 1);
}

.baron-drawing-toolbar__type svg,
.baron-drawing-toolbar__button svg {
	width: 21px;
	height: 21px;
}

.baron-drawing-toolbar__button {
	cursor: pointer;
	transition:
		color 120ms ease,
		background-color 120ms ease;
}

.baron-drawing-toolbar__button:hover:not(:disabled),
.baron-drawing-toolbar__grip:hover {
	color: rgba(41, 98, 255, 1);
	background: rgba(41, 98, 255, 0.08);
}

.baron-drawing-toolbar__button:focus-visible,
.baron-drawing-toolbar__grip:focus-visible,
.baron-drawing-toolbar__control:focus-within {
	outline: 2px solid rgba(41, 98, 255, 1);
	outline-offset: 1px;
}

.baron-drawing-toolbar__button:disabled,
.baron-drawing-toolbar__control:has(:disabled) {
	cursor: not-allowed;
	opacity: 0.42;
}

.baron-drawing-toolbar__separator {
	flex: 0 0 auto;
	width: 1px;
	height: 26px;
	margin: 0 4px;
	background: rgba(218, 220, 226, 1);
}

.baron-drawing-toolbar__control {
	min-width: 48px;
	padding: 0 5px;
}

.baron-drawing-toolbar__control select {
	height: 30px;
	padding: 0 20px 0 7px;
	color: inherit;
	background: transparent;
	border: 0;
	font: inherit;
	cursor: pointer;
	outline: 0;
}

.baron-drawing-toolbar__control--style select {
	min-width: 66px;
}

.baron-drawing-toolbar__control--width select {
	min-width: 58px;
	font-size: 15px;
}

.baron-drawing-toolbar__color {
	position: relative;
	display: grid;
	flex: 0 0 auto;
	width: 42px;
	height: 36px;
	place-items: center;
	border-radius: 8px;
	cursor: pointer;
}

.baron-drawing-toolbar__color:hover {
	background: rgba(41, 98, 255, 0.08);
}

.baron-drawing-toolbar__color input {
	position: absolute;
	width: 1px;
	height: 1px;
	opacity: 0;
	pointer-events: none;
}

.baron-drawing-toolbar__color-icon {
	position: relative;
	display: block;
	width: 22px;
	height: 22px;
}

.baron-drawing-toolbar__color-icon::before {
	position: absolute;
	top: 2px;
	left: 7px;
	width: 8px;
	height: 14px;
	content: "";
	border: 2px solid currentcolor;
	border-radius: 2px 2px 5px 2px;
	transform: rotate(42deg);
}

.baron-drawing-toolbar__color-icon::after {
	position: absolute;
	right: 1px;
	bottom: 0;
	left: 1px;
	height: 4px;
	content: "";
	background: var(--baron-drawing-line-color, rgba(41, 98, 255, 1));
	border-radius: 2px;
}

.baron-drawing-toolbar__text {
	width: 128px;
	height: 30px;
	padding: 0 9px;
	color: rgba(32, 35, 42, 1);
	background: rgba(248, 249, 251, 1);
	border: 1px solid rgba(218, 220, 226, 1);
	border-radius: 7px;
	font: inherit;
	outline: 0;
}

.baron-drawing-toolbar__text:focus {
	border-color: rgba(41, 98, 255, 1);
}

.baron-drawing-toolbar__status {
	position: absolute;
	top: calc(100% + 6px);
	left: 8px;
	max-width: 320px;
	padding: 6px 8px;
	color: rgba(179, 44, 38, 1);
	background: rgba(255, 247, 246, 0.98);
	border: 1px solid rgba(226, 181, 177, 1);
	border-radius: 6px;
	font-size: 11px;
	line-height: 1.35;
	box-shadow: 0 6px 18px rgba(20, 29, 48, 0.1);
}

.baron-drawing-toolbar__status[hidden] {
	display: none;
}

@media (prefers-reduced-motion: reduce) {
	.baron-drawing-toolbar,
	.baron-drawing-toolbar__button {
		transition: none;
	}
}
`;
