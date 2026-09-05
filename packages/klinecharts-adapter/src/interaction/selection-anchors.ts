import type { PixelCoordinate } from './hit-testing.js';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const ANCHOR_RADIUS = 5;
const ANCHOR_BORDER_SIZE = 2;

/**
 * 独占 Drawing 交互会消费原生点击事件，因此不能依赖 KLineCharts 的临时选中圆点。
 * 该只读覆盖层使用 Baron 权威命中几何持续绘制当前 Drawing 的操作锚点。
 */
export class SelectionAnchorLayer {
	readonly #container: HTMLElement;
	readonly #root: SVGSVGElement;
	readonly #originalInlinePosition: string;
	readonly #changedContainerPosition: boolean;
	readonly #resizeObserver: ResizeObserver | null;

	public constructor(container: HTMLElement, onResize: () => void) {
		this.#container = container;
		this.#originalInlinePosition = container.style.position;
		this.#changedContainerPosition = (
			container.ownerDocument.defaultView?.getComputedStyle(container).position ??
			container.style.position
		) === 'static';
		if (this.#changedContainerPosition) {
			container.style.position = 'relative';
		}

		const root = container.ownerDocument.createElementNS(SVG_NAMESPACE, 'svg');
		root.dataset.drawingSelectionAnchors = '';
		root.setAttribute('aria-hidden', 'true');
		root.style.position = 'absolute';
		root.style.inset = '0';
		root.style.zIndex = '3';
		root.style.width = '100%';
		root.style.height = '100%';
		root.style.overflow = 'hidden';
		root.style.pointerEvents = 'none';
		root.style.display = 'none';
		container.append(root);
		this.#root = root;

		const view = container.ownerDocument.defaultView;
		this.#resizeObserver = view !== null && typeof view.ResizeObserver !== 'undefined'
			? new view.ResizeObserver(() => onResize())
			: null;
		this.#resizeObserver?.observe(container);
	}

	public render(
		drawingId: string | null,
		anchors: readonly PixelCoordinate[],
		color: string,
		locked: boolean,
	): void {
		this.#root.replaceChildren();
		if (drawingId === null || anchors.length === 0) {
			this.#root.style.display = 'none';
			delete this.#root.dataset.drawingId;
			delete this.#root.dataset.locked;
			return;
		}
		this.#root.style.display = 'block';
		this.#root.dataset.drawingId = drawingId;
		this.#root.dataset.locked = String(locked);
		for (let index = 0; index < anchors.length; index++) {
			const anchor = anchors[index]!;
			const circle = this.#container.ownerDocument.createElementNS(SVG_NAMESPACE, 'circle');
			circle.dataset.anchorIndex = String(index);
			circle.setAttribute('cx', String(anchor.x));
			circle.setAttribute('cy', String(anchor.y));
			circle.setAttribute('r', String(ANCHOR_RADIUS));
			circle.setAttribute('fill', 'rgba(255, 255, 255, 0.98)');
			circle.setAttribute('stroke', color);
			circle.setAttribute('stroke-width', String(ANCHOR_BORDER_SIZE));
			circle.setAttribute('vector-effect', 'non-scaling-stroke');
			this.#root.append(circle);
		}
	}

	public destroy(): void {
		this.#resizeObserver?.disconnect();
		this.#root.remove();
		if (this.#changedContainerPosition) {
			this.#container.style.position = this.#originalInlinePosition;
		}
	}
}
