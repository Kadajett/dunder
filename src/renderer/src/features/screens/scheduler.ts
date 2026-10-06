/** Something the scheduler can repaint. */
export interface Paintable {
	/** Has unpainted changes. */
	readonly dirty: boolean;
	/** Some consumer is currently showing it. */
	readonly visible: boolean;
	paint(): void;
}

export interface PaintSchedulerOptions {
	/** Minimum time between two paints of the same item (default 250 ms, ~4 fps). */
	readonly intervalMs?: number;
}

export interface PaintScheduler {
	/**
	 * Asks for a repaint. Items that are clean or invisible when their turn comes are
	 * dropped; request again once they become dirty or visible.
	 */
	request(item: Paintable): void;
	/** Forgets the item (pending request and throttle history). */
	remove(item: Paintable): void;
}

export const DEFAULT_PAINT_INTERVAL_MS = 250;

/** Shared repaint loop: paints dirty, visible items at most once per interval each. */
export function createPaintScheduler(options: PaintSchedulerOptions = {}): PaintScheduler {
	const intervalMs = options.intervalMs ?? DEFAULT_PAINT_INTERVAL_MS;
	const pending = new Set<Paintable>();
	const lastPaint = new Map<Paintable, number>();
	let timer: number | undefined;
	let timerDue = Number.POSITIVE_INFINITY;

	const dueAt = (item: Paintable): number =>
		(lastPaint.get(item) ?? Number.NEGATIVE_INFINITY) + intervalMs;

	const schedule = (due: number): void => {
		if (timer !== undefined && timerDue <= due) return;
		clearTimeout(timer);
		timerDue = due;
		timer = setTimeout(tick, Math.max(0, due - Date.now()));
	};

	function tick(): void {
		timer = undefined;
		timerDue = Number.POSITIVE_INFINITY;
		const now = Date.now();
		let next = Number.POSITIVE_INFINITY;
		for (const item of pending) {
			if (!(item.dirty && item.visible)) {
				pending.delete(item);
				continue;
			}
			const due = dueAt(item);
			if (due > now) {
				next = Math.min(next, due);
				continue;
			}
			pending.delete(item);
			lastPaint.set(item, now);
			item.paint();
		}
		if (next !== Number.POSITIVE_INFINITY) schedule(next);
	}

	return {
		request(item) {
			if (!(item.dirty && item.visible)) return;
			pending.add(item);
			schedule(dueAt(item));
		},
		remove(item) {
			pending.delete(item);
			lastPaint.delete(item);
		},
	};
}
