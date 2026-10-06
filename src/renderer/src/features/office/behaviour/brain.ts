import type { AgentStatus } from "@shared/herdr/schema";
import type { Vec2 } from "@shared/layout/schema";
import type { Placement } from "../scene/station";

/**
 * What an agent's body is doing. herdr status drives it: a busy agent
 * (working or blocked) is always at, or heading back to, its desk; an idle
 * one sometimes stretches its legs and visits a spot in the office.
 */
export type Brain =
	| { readonly mode: "seated"; readonly nextOutingAt: number }
	| {
			readonly mode: "walking";
			readonly purpose: "outing" | "return";
			readonly path: readonly Vec2[];
			readonly goal: Placement;
	  }
	| { readonly mode: "hanging"; readonly at: Placement; readonly until: number };

export type BrainEvent =
	| {
			readonly type: "tick";
			readonly status: AgentStatus;
			readonly now: number;
			readonly position: Vec2;
	  }
	| { readonly type: "arrived"; readonly now: number };

export interface BrainWorld {
	readonly seat: Placement;
	/** A place to visit, chosen with `random`. */
	pickSpot(random: () => number): Placement | undefined;
	route(from: Vec2, to: Vec2): Vec2[] | undefined;
	random(): number;
}

/** Seconds an idle agent stays seated before wandering, and how long it lingers. */
export const TIMING = {
	firstOuting: [6, 30],
	betweenOutings: [25, 75],
	linger: [6, 16],
} as const;

const between = (random: () => number, [low, high]: readonly [number, number]): number =>
	low + (high - low) * random();

const isBusy = (status: AgentStatus): boolean => status === "working" || status === "blocked";

export function initialBrain(now: number, random: () => number): Brain {
	return { mode: "seated", nextOutingAt: now + between(random, TIMING.firstOuting) };
}

function walkTo(
	world: BrainWorld,
	from: Vec2,
	goal: Placement,
	purpose: "outing" | "return",
): Brain | undefined {
	const path = world.route(from, goal.position);
	return path ? { mode: "walking", purpose, path, goal } : undefined;
}

function sitDown(now: number, world: BrainWorld): Brain {
	return { mode: "seated", nextOutingAt: now + between(world.random, TIMING.betweenOutings) };
}

function onTick(
	brain: Brain,
	event: Extract<BrainEvent, { type: "tick" }>,
	world: BrainWorld,
): Brain {
	const busy = isBusy(event.status);
	if (brain.mode === "seated") {
		if (busy)
			return {
				mode: "seated",
				nextOutingAt: Math.max(brain.nextOutingAt, event.now + TIMING.firstOuting[0]),
			};
		if (event.now < brain.nextOutingAt) return brain;
		const spot = world.pickSpot(world.random);
		const outing = spot ? walkTo(world, world.seat.position, spot, "outing") : undefined;
		return outing ?? sitDown(event.now, world);
	}
	const headHome =
		(brain.mode === "walking" && brain.purpose === "outing" && busy) ||
		(brain.mode === "hanging" && (busy || event.now >= brain.until));
	if (!headHome) return brain;
	// No route home (should not happen in a connected room): teleporting beats getting stuck.
	return walkTo(world, event.position, world.seat, "return") ?? sitDown(event.now, world);
}

/** Pure transition function for one agent's behaviour. */
export function stepBrain(brain: Brain, event: BrainEvent, world: BrainWorld): Brain {
	if (event.type === "tick") return onTick(brain, event, world);
	if (brain.mode !== "walking") return brain;
	if (brain.purpose === "return") return sitDown(event.now, world);
	return {
		mode: "hanging",
		at: brain.goal,
		until: event.now + between(world.random, TIMING.linger),
	};
}
