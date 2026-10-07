import type { PoolBall, PoolFrame, PoolView } from "@shared/pool";
import { create } from "zustand";
import { poolPlayers } from "./table-space";

interface PoolState {
	/** The table as main last published it; null until the first answer (or without the pool API). */
	readonly view: PoolView | null;
}

/** React state: the view only. Frames (~30 Hz) never go through it; see `latestFrame`. */
export const usePool = create<PoolState>(() => ({ view: null }));

/** The newest frame of the shot rolling now; read in `useFrame`, never rendered from. */
let frame: PoolFrame | null = null;

export function latestFrame(): PoolFrame | null {
	return frame;
}

/** Ball positions as frames carry them: [id, x, y] for each ball on the table. */
export type BallSpots = PoolFrame["balls"];

/** A table's balls as spots, made once per table (views change a few times a shot, frames 30 times a second). */
const spotsOf = new WeakMap<readonly PoolBall[], BallSpots>();

export function tableSpots(balls: readonly PoolBall[]): BallSpots {
	let spots = spotsOf.get(balls);
	if (!spots) {
		spots = balls.flatMap((ball) =>
			ball.pocket === null ? [[ball.id, ball.x, ball.y] as const] : [],
		);
		spotsOf.set(balls, spots);
	}
	return spots;
}

/**
 * Where the balls are right now: the rolling shot's frame while the balls move
 * (main keeps `view.balls` at the pre-shot table until they stop), the view's
 * table otherwise. Allocates nothing per frame.
 */
export function spotsNow(view: PoolView, current: PoolFrame | null): BallSpots {
	if (view.moving && current && current.shot === view.shot + 1) return current.balls;
	return tableSpots(view.balls);
}

/** What an agent is doing at the pool table, for its Team card; undefined when it isn't there. */
export function poolStatusOf(view: PoolView | null, name: string): string | undefined {
	if (poolPlayers(view).includes(name)) return "at the pool table";
	return view?.queue.includes(name) ? "waiting for the pool table" : undefined;
}

/**
 * Follow main's pool table for the page's lifetime; a no-op on builds without
 * the pool API. A fresh page is never in table view, so it says so first: a
 * reload or crash in table view would otherwise leave main waiting on Jeremy.
 */
export function connectPool(): () => void {
	if (!("pool" in window.office)) return () => undefined;
	const api = window.office.pool;
	let live = true;
	void api.setViewing(false);
	void api.get().then((view) => {
		if (live) usePool.setState({ view });
	});
	const offView = api.onChanged((view) => usePool.setState({ view }));
	const offFrame = api.onFrame((next) => {
		frame = next;
	});
	return () => {
		live = false;
		offView();
		offFrame();
	};
}
