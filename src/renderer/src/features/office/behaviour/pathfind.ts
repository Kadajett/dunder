import type { Vec2 } from "@shared/layout/schema";
import { cellCenter, cellOf, isBlocked, type NavGrid } from "./nav-grid";

const NEIGHBOURS = [
	[1, 0, 1],
	[-1, 0, 1],
	[0, 1, 1],
	[0, -1, 1],
	[1, 1, Math.SQRT2],
	[1, -1, Math.SQRT2],
	[-1, 1, Math.SQRT2],
	[-1, -1, Math.SQRT2],
] as const;

/** Nearest walkable cell to `cell` (breadth-first), for starts/goals inside furniture clearance. */
function nearestOpen(
	grid: NavGrid,
	[col, row]: readonly [number, number],
): readonly [number, number] | undefined {
	for (let radius = 0; radius < 6; radius += 1) {
		for (let dc = -radius; dc <= radius; dc += 1) {
			for (let dr = -radius; dr <= radius; dr += 1) {
				if (!isBlocked(grid, col + dc, row + dr)) return [col + dc, row + dr];
			}
		}
	}
	return undefined;
}

interface Search {
	readonly grid: NavGrid;
	readonly cost: Float32Array;
	readonly came: Int32Array;
	/** Open set: cell → estimated total cost. */
	readonly open: Map<number, number>;
	heuristic(index: number): number;
}

function popCheapest(open: Map<number, number>): number {
	let current = -1;
	let best = Number.POSITIVE_INFINITY;
	for (const [index, score] of open) {
		if (score < best) [current, best] = [index, score];
	}
	open.delete(current);
	return current;
}

function expand(search: Search, current: number): void {
	const { grid, cost, came, open } = search;
	const col = current % grid.cols;
	const row = Math.floor(current / grid.cols);
	for (const [dc, dr, step] of NEIGHBOURS) {
		const [nc, nr] = [col + dc, row + dr];
		// No corner cutting: a diagonal needs both orthogonal cells free.
		if (isBlocked(grid, nc, nr) || isBlocked(grid, nc, row) || isBlocked(grid, col, nr)) continue;
		const next = nr * grid.cols + nc;
		const tentative = (cost[current] ?? 0) + step;
		if (tentative >= (cost[next] ?? Number.POSITIVE_INFINITY)) continue;
		cost[next] = tentative;
		came[next] = current;
		open.set(next, tentative + search.heuristic(next));
	}
}

function aStar(grid: NavGrid, start: number, goal: number): number[] | undefined {
	const goalCol = goal % grid.cols;
	const goalRow = Math.floor(goal / grid.cols);
	const search: Search = {
		grid,
		cost: new Float32Array(grid.cols * grid.rows).fill(Number.POSITIVE_INFINITY),
		came: new Int32Array(grid.cols * grid.rows).fill(-1),
		open: new Map(),
		heuristic: (index) =>
			Math.hypot((index % grid.cols) - goalCol, Math.floor(index / grid.cols) - goalRow),
	};
	search.cost[start] = 0;
	search.open.set(start, search.heuristic(start));
	while (search.open.size > 0) {
		const current = popCheapest(search.open);
		if (current === goal) return unwind(search.came, goal);
		expand(search, current);
	}
	return undefined;
}

function unwind(came: Int32Array, goal: number): number[] {
	const path = [goal];
	let index = came[goal] ?? -1;
	while (index !== -1) {
		path.unshift(index);
		index = came[index] ?? -1;
	}
	return path;
}

function lineIsClear(grid: NavGrid, from: Vec2, to: Vec2): boolean {
	const steps = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.15);
	for (let i = 1; i < steps; i += 1) {
		const t = i / steps;
		const [col, row] = cellOf(grid, {
			x: from.x + (to.x - from.x) * t,
			z: from.z + (to.z - from.z) * t,
		});
		if (isBlocked(grid, col, row)) return false;
	}
	return true;
}

/** Drop waypoints that can be skipped with a clear straight line. */
function smooth(grid: NavGrid, points: readonly Vec2[]): Vec2[] {
	const result: Vec2[] = [];
	let anchor = 0;
	const first = points[0];
	if (first) result.push(first);
	while (anchor < points.length - 1) {
		let furthest = anchor + 1;
		const from = points[anchor];
		for (let candidate = points.length - 1; candidate > anchor + 1 && from; candidate -= 1) {
			const to = points[candidate];
			if (to && lineIsClear(grid, from, to)) {
				furthest = candidate;
				break;
			}
		}
		const next = points[furthest];
		if (next) result.push(next);
		anchor = furthest;
	}
	return result;
}

/**
 * Walkable route from `from` to `to` (both exact endpoints are kept, so a
 * walker can leave and reach a chair inside furniture clearance).
 * Returns `undefined` when no route exists.
 */
export function findPath(grid: NavGrid, from: Vec2, to: Vec2): Vec2[] | undefined {
	const start = nearestOpen(grid, cellOf(grid, from));
	const goal = nearestOpen(grid, cellOf(grid, to));
	if (!start || !goal) return undefined;
	const cells = aStar(grid, start[1] * grid.cols + start[0], goal[1] * grid.cols + goal[0]);
	if (!cells) return undefined;
	const points = cells.map((index) =>
		cellCenter(grid, index % grid.cols, Math.floor(index / grid.cols)),
	);
	return [from, ...smooth(grid, points), to];
}
