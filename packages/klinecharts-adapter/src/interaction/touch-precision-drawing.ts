export interface TouchPrecisionPoint {
	readonly x: number;
	readonly y: number;
}

export interface TouchPrecisionBounds {
	readonly left: number;
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
}

export type TouchPrecisionDrawingPhase =
	| 'move-start'
	| 'confirm-start'
	| 'confirm-end';

export const TOUCH_PRECISION_CURSOR_OFFSET = Object.freeze({
	x: -56,
	y: -104,
});

export const TOUCH_PRECISION_TAP_DISTANCE = 8;

export function resolveTouchPrecisionCursor(
	pointer: TouchPrecisionPoint,
	bounds: TouchPrecisionBounds,
	offset: TouchPrecisionPoint = TOUCH_PRECISION_CURSOR_OFFSET,
): TouchPrecisionPoint {
	return {
		x: Math.max(bounds.left, Math.min(pointer.x + offset.x, bounds.right)),
		y: Math.max(bounds.top, Math.min(pointer.y + offset.y, bounds.bottom)),
	};
}

export function isTouchPrecisionTap(
	origin: TouchPrecisionPoint,
	current: TouchPrecisionPoint,
	threshold = TOUCH_PRECISION_TAP_DISTANCE,
): boolean {
	return Math.hypot(current.x - origin.x, current.y - origin.y) < threshold;
}

const TOUCH_PRECISION_DRAWING_STYLES = String.raw`
.baron-touch-drawing-guide,
.baron-touch-drawing-guide * {
	box-sizing: border-box;
}

.baron-touch-drawing-guide {
	position: absolute;
	inset: 0;
	z-index: 50;
	overflow: hidden;
	pointer-events: none;
	font-family: inherit;
	font-synthesis: none;
}

.baron-touch-drawing-guide[hidden] {
	display: none;
}

.baron-touch-drawing-guide__prompt {
	position: absolute;
	top: max(8px, env(safe-area-inset-top));
	right: 8px;
	left: 8px;
	display: grid;
	grid-template-columns: auto minmax(0, 1fr) 44px;
	align-items: center;
	min-height: 44px;
	color: rgba(255, 255, 255, 0.96);
	background: rgba(31, 34, 38, 0.94);
	border: 1px solid rgba(255, 255, 255, 0.09);
	border-radius: 12px;
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
	backdrop-filter: blur(10px);
}

.baron-touch-drawing-guide__progress {
	min-width: 44px;
	margin-left: 6px;
	padding: 6px 8px;
	color: rgba(255, 255, 255, 0.8);
	background: rgba(255, 255, 255, 0.1);
	border-radius: 8px;
	font-size: 11px;
	font-variant-numeric: tabular-nums;
	font-weight: 750;
	line-height: 1;
	text-align: center;
}

.baron-touch-drawing-guide__message {
	min-width: 0;
	padding: 0 10px;
	overflow: hidden;
	font-size: 13px;
	font-weight: 700;
	line-height: 18px;
	text-align: center;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.baron-touch-drawing-guide__cancel {
	display: grid;
	width: 44px;
	height: 44px;
	padding: 0;
	place-items: center;
	color: rgba(255, 255, 255, 0.82);
	background: transparent;
	border: 0;
	border-radius: 10px;
	cursor: pointer;
	pointer-events: auto;
	touch-action: manipulation;
}

.baron-touch-drawing-guide__cancel:active {
	color: rgba(255, 255, 255, 1);
	background: rgba(255, 255, 255, 0.12);
}

.baron-touch-drawing-guide__cancel:focus-visible {
	outline: 2px solid rgba(112, 140, 255, 1);
	outline-offset: -3px;
}

.baron-touch-drawing-guide__cancel svg {
	width: 20px;
	height: 20px;
	fill: none;
	stroke: currentcolor;
	stroke-linecap: round;
	stroke-linejoin: round;
	stroke-width: 1.8;
}

.baron-touch-drawing-guide__cursor {
	position: absolute;
	top: 0;
	left: 0;
	display: none;
	width: 0;
	height: 0;
	transform: translate3d(
		var(--baron-touch-cursor-x, 0),
		var(--baron-touch-cursor-y, 0),
		0
	);
	transition: opacity 120ms ease;
}

.baron-touch-drawing-guide[data-has-cursor="true"] .baron-touch-drawing-guide__cursor {
	display: block;
}

.baron-touch-drawing-guide__cursor::before,
.baron-touch-drawing-guide__cursor::after {
	position: absolute;
	content: "";
	opacity: 0.72;
	pointer-events: none;
}

.baron-touch-drawing-guide__cursor::before {
	top: calc(-1 * var(--baron-touch-cursor-y, 0));
	left: 0;
	width: 0;
	height: 100vh;
	border-left: 1px dashed rgba(41, 98, 255, 0.72);
}

.baron-touch-drawing-guide__cursor::after {
	top: 0;
	left: calc(-1 * var(--baron-touch-cursor-x, 0));
	width: 100vw;
	height: 0;
	border-top: 1px dashed rgba(41, 98, 255, 0.72);
}

.baron-touch-drawing-guide__cursor-dot {
	position: absolute;
	top: -4px;
	left: -4px;
	z-index: 1;
	width: 9px;
	height: 9px;
	background: rgba(41, 98, 255, 1);
	border: 2px solid rgba(255, 255, 255, 0.98);
	border-radius: 50%;
	box-shadow: 0 1px 5px rgba(17, 24, 39, 0.24);
}

@media (prefers-reduced-motion: reduce) {
	.baron-touch-drawing-guide__cursor {
		transition: none;
	}
}
`;

function promptForPhase(phase: TouchPrecisionDrawingPhase): {
	readonly progress: string;
	readonly message: string;
} {
	switch (phase) {
		case 'move-start':
			return { progress: '1 / 4', message: '将光标移至起点' };
		case 'confirm-start':
			return { progress: '2 / 4', message: '点击设置第一个点' };
		case 'confirm-end':
			return { progress: '4 / 4', message: '点击即可完成' };
	}
}

export class TouchPrecisionDrawingGuide {
	readonly #container: HTMLElement;
	readonly #root: HTMLDivElement;
	readonly #progress: HTMLSpanElement;
	readonly #message: HTMLSpanElement;
	readonly #cancel: HTMLButtonElement;
	readonly #originalInlinePosition: string;
	readonly #changedContainerPosition: boolean;
	readonly #handleCancel: () => void;

	public constructor(container: HTMLElement, onCancel: () => void) {
		this.#container = container;
		this.#originalInlinePosition = container.style.position;
		this.#changedContainerPosition = (
			container.ownerDocument.defaultView?.getComputedStyle(container).position ??
			container.style.position
		) === 'static';
		if (this.#changedContainerPosition) {
			container.style.position = 'relative';
		}

		const document = container.ownerDocument;
		const root = document.createElement('div');
		root.className = 'baron-touch-drawing-guide';
		root.dataset.touchDrawingGuide = '';
		root.hidden = true;
		const style = document.createElement('style');
		style.dataset.baronTouchDrawingGuideStyles = '';
		style.textContent = TOUCH_PRECISION_DRAWING_STYLES;

		const prompt = document.createElement('div');
		prompt.className = 'baron-touch-drawing-guide__prompt';
		const progress = document.createElement('span');
		progress.className = 'baron-touch-drawing-guide__progress';
		const message = document.createElement('span');
		message.className = 'baron-touch-drawing-guide__message';
		message.setAttribute('role', 'status');
		message.setAttribute('aria-live', 'polite');
		const cancel = document.createElement('button');
		cancel.type = 'button';
		cancel.className = 'baron-touch-drawing-guide__cancel';
		cancel.dataset.touchDrawingCancel = '';
		cancel.setAttribute('aria-label', '取消绘制线段');
		cancel.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"/></svg>';
		prompt.append(progress, message, cancel);

		const cursor = document.createElement('div');
		cursor.className = 'baron-touch-drawing-guide__cursor';
		const dot = document.createElement('span');
		dot.className = 'baron-touch-drawing-guide__cursor-dot';
		cursor.append(dot);
		root.append(style, prompt, cursor);
		container.append(root);

		this.#root = root;
		this.#progress = progress;
		this.#message = message;
		this.#cancel = cancel;
		this.#handleCancel = () => onCancel();
		cancel.addEventListener('click', this.#handleCancel);
		this.setPhase('move-start');
	}

	public show(): void {
		this.#root.hidden = false;
	}

	public hide(): void {
		this.#root.hidden = true;
		delete this.#root.dataset.hasCursor;
	}

	public setPhase(phase: TouchPrecisionDrawingPhase): void {
		const prompt = promptForPhase(phase);
		this.#root.dataset.phase = phase;
		this.#progress.textContent = prompt.progress;
		this.#message.textContent = prompt.message;
	}

	public updateCursor(point: TouchPrecisionPoint): void {
		this.#root.dataset.hasCursor = 'true';
		this.#root.dataset.cursorX = String(Math.round(point.x));
		this.#root.dataset.cursorY = String(Math.round(point.y));
		this.#root.style.setProperty('--baron-touch-cursor-x', `${point.x}px`);
		this.#root.style.setProperty('--baron-touch-cursor-y', `${point.y}px`);
	}

	public ownsCancelTarget(target: EventTarget | null): boolean {
		return target !== null &&
			typeof target === 'object' &&
			'nodeType' in target &&
			this.#cancel.contains(target as Node);
	}

	public destroy(): void {
		this.#cancel.removeEventListener('click', this.#handleCancel);
		this.#root.remove();
		if (this.#changedContainerPosition) {
			this.#container.style.position = this.#originalInlinePosition;
		}
	}
}
