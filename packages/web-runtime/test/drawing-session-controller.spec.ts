import { describe, expect, it } from 'vitest';

import chartWorkspaceFixture from '../../../tests/fixtures/workspaces/chart-minimal.json';
import type { Drawing } from '@baron1996/kline-scene-schema';
import type {
	DrawingEnginePort,
	EngineDrawingEvent,
	EngineDrawingSnapshot,
	EngineDrawingStartRequest,
} from '@baron1996/klinecharts-adapter';
import { DrawingProjectionService } from '../src/drawing/projection-service.js';
import {
	DrawingSessionController,
	DrawingSessionError,
} from '../src/drawing/session-controller.js';
import type { WorkspaceRuntimeEvent } from '../src/drawing/workspace-events.js';

const valueAxes = chartWorkspaceFixture.drawings.coordinateSystem.valueAxes;
const scene = {
	kind: 'chart',
	document: chartWorkspaceFixture.scene.document,
} as never;

const STYLES: Drawing['styles'] = {
	line: { color: 'rgba(41, 98, 255, 1)', size: 1, style: 'solid' },
	fill: { color: 'rgba(41, 98, 255, 0.15)' },
	text: {
		color: 'rgba(255, 255, 255, 1)',
		size: 12,
		family: 'Baron Sans',
		weight: 'normal',
		backgroundColor: 'rgba(41, 98, 255, 1)',
		borderColor: 'rgba(41, 98, 255, 1)',
	},
};

function snapshot(
	id: string,
	value = 12.55,
): EngineDrawingSnapshot {
	return {
		id,
		type: 'horizontalStraightLine',
		target: { paneRole: 'candle', yAxisRole: 'primary' },
		geometry: { value },
		styles: structuredClone(STYLES),
		locked: false,
		visible: true,
		zLevel: 0,
		mode: 'normal',
	};
}

class MockEngine implements DrawingEnginePort {
	public readonly sceneKind = 'chart' as const;
	public drawings = new Map<string, EngineDrawingSnapshot>();
	public listener: ((event: EngineDrawingEvent) => void) | null = null;
	public started: EngineDrawingStartRequest | null = null;

	public restoreDrawings(drawings: readonly EngineDrawingSnapshot[]): void {
		this.drawings = new Map(drawings.map((drawing) => [drawing.id, drawing]));
	}

	public startDrawing(request: EngineDrawingStartRequest): string {
		this.started = request;
		const drawing = {
			id: request.id,
			type: request.type,
			target: request.target,
			geometry: { value: 0 } as never,
			styles: request.styles,
			locked: false,
			visible: true,
			zLevel: 0,
			mode: 'normal',
		};
		this.drawings.set(request.id, drawing);
		return request.id;
	}

	public listDrawings(): readonly EngineDrawingSnapshot[] {
		return [...this.drawings.values()];
	}

	public getDrawing(id: string): EngineDrawingSnapshot | undefined {
		return this.drawings.get(id);
	}

	public updateDrawingStyles(
		id: string,
		styles: Drawing['styles'],
	): EngineDrawingSnapshot {
		const before = this.drawings.get(id)!;
		const after = { ...structuredClone(before), styles: structuredClone(styles) };
		this.drawings.set(id, after);
		this.listener?.({
			type: 'updated',
			id,
			drawing: after,
			editDimensions: { horizontal: false, vertical: true },
		});
		return after;
	}

	public updateDrawingText(id: string, text: string): EngineDrawingSnapshot {
		const before = this.drawings.get(id)!;
		const after = structuredClone(before);
		this.drawings.set(id, after);
		this.listener?.({
			type: 'updated',
			id,
			drawing: after,
			editDimensions: { horizontal: false, vertical: false },
		});
		return after;
	}

	public restoreDrawing(snapshotValue: EngineDrawingSnapshot): void {
		this.drawings.set(snapshotValue.id, structuredClone(snapshotValue));
	}

	public removeDrawing(id: string): boolean {
		const removed = this.drawings.delete(id);
		if (removed) {
			this.listener?.({ type: 'removed', id });
		}
		return removed;
	}

	public selectDrawing(id: string | null): void {
		this.listener?.({
			type: id === null ? 'deselected' : 'selected',
			id: id ?? 'none',
		});
	}

	public hitTestDrawing(): string | null {
		return null;
	}

	public projectToPixel(): { readonly x: number; readonly y: number } {
		return { x: 0, y: 0 };
	}

	public unprojectFromPixel(): Record<string, never> {
		return {};
	}

	public setMutationsEnabled(): void {}

	public subscribeDrawingEvents(
		listener: (event: EngineDrawingEvent) => void,
	): () => void {
		this.listener = listener;
		return () => {
			this.listener = null;
		};
	}

	public dispose(): void {}

	public emitCreated(id: string, value = 12.55): void {
		const drawing = snapshot(id, value);
		this.drawings.set(id, drawing);
		this.listener?.({ type: 'created', id, drawing });
	}
}

function buildController(
	commitMode: 'immediate' | 'host-confirmed',
): {
	readonly engine: MockEngine;
	readonly controller: DrawingSessionController;
	readonly events: WorkspaceRuntimeEvent[];
} {
	const engine = new MockEngine();
	const events: WorkspaceRuntimeEvent[] = [];
	const controller = new DrawingSessionController({
		runtimeId: 'test-runtime',
		commitMode,
		engine,
		projectionService: new DrawingProjectionService(),
		scene,
		valueAxes,
		target: { paneRole: 'candle', yAxisRole: 'primary' },
		scopeKey: chartWorkspaceFixture.drawings.scopeKey,
		timezone: chartWorkspaceFixture.drawings.coordinateSystem.timezone,
		buildDocument: (drawings) => ({
			schema: '@baron1996/drawing-document',
			version: 1,
			scopeKey: chartWorkspaceFixture.drawings.scopeKey,
			coordinateSystem: structuredClone(
				chartWorkspaceFixture.drawings.coordinateSystem,
			),
			drawings: drawings.map((entry) => ({
				id: entry.id,
				type: entry.type,
				target: entry.target,
				geometry: entry.geometry,
				styles: entry.styles,
				visible: entry.visible,
				locked: entry.locked,
				zLevel: entry.zLevel,
				mode: entry.mode,
			})) as never,
			metadata: {},
		}),
		emit: (event) => events.push(event),
	});
	controller.restoreConfirmed([]);
	return { engine, controller, events };
}

async function flush(): Promise<void> {
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
	await Promise.resolve();
}

describe('DrawingSessionController', () => {
	it('commits immediately in immediate mode without mutating confirmed on progress', async () => {
		const { engine, controller, events } = buildController('immediate');
		engine.emitCreated('drawing-a', 12.55);
		await flush();
		expect(controller.confirmedDrawings).toHaveLength(1);
		expect(controller.state).toBe('ready');
		expect(events.some((event) => event.type === 'drawing-committed')).toBe(true);
	});

	it('waits for host confirmation and rejects pending mutations in host-confirmed mode', async () => {
		const { engine, controller, events } = buildController('host-confirmed');
		engine.emitCreated('drawing-a', 12.55);
		await flush();
		expect(controller.state).toBe('awaiting-host-confirmation');
		expect(controller.confirmedDrawings).toHaveLength(0);
		const candidate = events.find((event) => event.type === 'drawing-candidate');
		expect(candidate?.type).toBe('drawing-candidate');
		expect(() => controller.startCreate('horizontalStraightLine'))
			.toThrowError(expect.objectContaining({ code: 'DRAWING_CHANGE_IN_PROGRESS' }));
	});

	it('commits only on exact request id and canonical hash', async () => {
		const { engine, controller, events } = buildController('host-confirmed');
		engine.emitCreated('drawing-a', 12.55);
		await flush();
		const candidate = events.find((event) => event.type === 'drawing-candidate');
		expect(candidate?.type).toBe('drawing-candidate');
		if (candidate?.type !== 'drawing-candidate') {
			return;
		}
		expect(() => controller.commitDrawingChange('wrong-request', candidate.canonicalHash))
			.toThrowError(expect.objectContaining({ code: 'DRAWING_CHANGE_REJECTED' }));
		expect(() => controller.commitDrawingChange(candidate.requestId, 'bad-hash'))
			.toThrowError(expect.objectContaining({ code: 'DRAWING_CHANGE_HASH_MISMATCH' }));
		expect(controller.commitDrawingChange(candidate.requestId, candidate.canonicalHash))
			.toBe(true);
		expect(controller.confirmedDrawings).toHaveLength(1);
		expect(controller.state).toBe('ready');
	});

	it('rejects a candidate and restores the engine before-state', async () => {
		const { engine, controller, events } = buildController('host-confirmed');
		controller.restoreConfirmed([snapshot('drawing-before', 12.5)]);
		engine.emitCreated('drawing-after', 12.6);
		await flush();
		const candidateEvent = events.find((event) => event.type === 'drawing-candidate');
		expect(candidateEvent?.type).toBe('drawing-candidate');
		if (candidateEvent?.type === 'drawing-candidate') {
			expect(controller.rejectDrawingChange(candidateEvent.requestId)).toBe(true);
		}
		expect(controller.confirmedDrawings.map((drawing) => drawing.id))
			.toEqual(['drawing-before']);
		expect(engine.drawings.has('drawing-after')).toBe(false);
		expect(controller.state).toBe('ready');
	});

	it('enters terminal-error and rejects all operations except destroy', async () => {
		const { controller } = buildController('immediate');
		controller.enterTerminalError('DRAWING_PROJECTION_INVALID', 'boom');
		expect(controller.state).toBe('terminal-error');
		expect(() => controller.startCreate('horizontalStraightLine'))
			.toThrowError(expect.objectContaining({ code: 'DRAWABLE_WORKSPACE_RUNTIME_DESTROYED' }));
		expect(() => controller.removeDrawing('x'))
			.toThrowError(DrawingSessionError);
		controller.destroy();
		controller.destroy();
		expect(controller.state).toBe('destroyed');
	});

	it('keeps confirmed unchanged while the candidate is pending', async () => {
		const { engine, controller } = buildController('host-confirmed');
		controller.restoreConfirmed([snapshot('stable', 12.5)]);
		const before = JSON.stringify(controller.confirmedDrawings);
		engine.emitCreated('candidate', 12.6);
		await flush();
		expect(JSON.stringify(controller.confirmedDrawings)).toBe(before);
	});
});
