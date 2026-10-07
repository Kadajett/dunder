import type { PoolBall, PoolFrame, PoolView } from "@shared/pool";
import { create } from "zustand";
import { poolPlayers } from "./table-space";

interface PoolState {
	/** The table as main last published it; null until the first answer (or without the pool API). */
	readonly view: PoolView | null;
	/** The newest frame of the shot rolling now, if any. */
	readonly frame: PoolFrame | null;
}

export const usePool = create<PoolState>(() => ({ view: null, frame: null }));

/**
 * Where the balls are right now: the rolling shot's latest frame while the
 * balls move (main keeps `view.balls` at the pre-shot table until they stop),
 * the view's table otherwise.
 */
export function ballsNow(view: PoolView | null, frame: PoolFrame | null): readonly PoolBall[] {
	if (!view) return [];
	if (!view.moving || !frame || frame.shot !== view.shot + 1) return view.balls;
	return frame.balls.map(([id, x, y]) => ({ id, x, y, pocket: null }));
}

/** What an agent is doing at the pool table, for its Team card; undefined when it isn't there. */
export function poolStatusOf(view: PoolView | null, name: string): string | undefined {
	if (poolPlayers(view).includes(name)) return "at the pool table";
	return view?.queue.includes(name) ? "waiting for the pool table" : undefined;
}

/** Follow main's pool table for the page's lifetime; a no-op on builds without the pool API. */
export function connectPool(): () => void {
	if (!("pool" in window.office)) return () => undefined;
	const api = window.office.pool;
	let live = true;
	void api.get().then((view) => {
		if (live) usePool.setState({ view });
	});
	const offView = api.onChanged((view) => usePool.setState({ view }));
	const offFrame = api.onFrame((frame) => usePool.setState({ frame }));
	return () => {
		live = false;
		offView();
		offFrame();
	};
}
