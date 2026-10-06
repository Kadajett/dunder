import type { AgentStatus } from "@shared/herdr/schema";
import type { Vec2 } from "@shared/layout/schema";
import type { Placement } from "../scene/station";
import { FACE_CAMERA } from "./workout-spots";

type WalkPurpose = "outing" | "return" | "workout" | "visit" | "meeting";

/** Go and talk to a colleague (a delivered office message), on the brain's clock. */
export interface VisitWindow {
	/** The message being delivered in person. */
	readonly id: string;
	/** Where to stand: beside the colleague's desk, facing them. */
	readonly at: Placement;
	/** When the chat is over and the visitor heads back. */
	readonly until: number;
}

/**
 * What an agent's body is doing. herdr status drives it: a busy agent
 * (working or blocked) is always at, or heading back to, its desk; an idle
 * one sometimes stretches its legs and visits a spot in the office. A
 * workout signal overrides everything, then a brainstorm (standing with the
 * others at the whiteboard, working away in the terminal); a colleague visit
 * (delivering an office message in person) overrides status.
 */
export type Brain =
	| { readonly mode: "seated"; readonly nextOutingAt: number }
	| {
			readonly mode: "walking";
			readonly purpose: WalkPurpose;
			readonly path: readonly Vec2[];
			readonly goal: Placement;
			readonly visit?: VisitWindow;
	  }
	| {
			readonly mode: "hanging";
			readonly at: Placement;
			readonly until: number;
			readonly visit?: VisitWindow;
	  }
	| { readonly mode: "exercising"; readonly at: Placement }
	/** Standing with the others at the whiteboard during a brainstorm. */
	| { readonly mode: "meeting"; readonly at: Placement };

/** A workout the agent takes part in, on the brain's clock (seconds). */
export interface WorkoutWindow {
	readonly start: number;
	/** When the routine is over and everyone heads back. */
	readonly end: number;
}

export type BrainEvent =
	| {
			readonly type: "tick";
			readonly status: AgentStatus;
			readonly now: number;
			readonly position: Vec2;
			readonly workout: WorkoutWindow | undefined;
			readonly visit?: VisitWindow | undefined;
			/** The agent takes part in the running brainstorm. */
			readonly meeting?: boolean;
	  }
	| { readonly type: "arrived"; readonly now: number };

type Tick = Extract<BrainEvent, { type: "tick" }>;

export interface BrainWorld {
	readonly seat: Placement;
	/** Where to exercise, best first: the group's open floor, then beside the desk. */
	readonly workoutSpots: readonly Placement[];
	/** Where to stand during a brainstorm, best first: by the whiteboard, then beside the desk. */
	readonly meetingSpots: readonly Placement[];
	/** A place to visit, chosen with `random`. */
	pickSpot(random: () => number): Placement | undefined;
	route(from: Vec2, to: Vec2): Vec2[] | undefined;
	random(): number;
	/** Where to stand to talk to a seated colleague, by agent name (for message visits). */
	colleagueSpot(agentName: string): Placement | undefined;
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
	purpose: WalkPurpose,
): Brain | undefined {
	const path = world.route(from, goal.position);
	return path ? { mode: "walking", purpose, path, goal } : undefined;
}

function sitDown(now: number, world: BrainWorld): Brain {
	return { mode: "seated", nextOutingAt: now + between(world.random, TIMING.betweenOutings) };
}

function goHome(event: Tick, world: BrainWorld): Brain {
	// No route home (should not happen in a connected room): teleporting beats getting stuck.
	return walkTo(world, event.position, world.seat, "return") ?? sitDown(event.now, world);
}

/** Head for the first reachable workout spot; with none reachable, exercise right here. */
function joinWorkout(event: Tick, world: BrainWorld): Brain {
	for (const spot of world.workoutSpots) {
		const walk = walkTo(world, event.position, spot, "workout");
		if (walk) return walk;
	}
	return { mode: "exercising", at: { position: event.position, rotationY: FACE_CAMERA } };
}

const inWorkout = (brain: Brain): boolean =>
	brain.mode === "exercising" || (brain.mode === "walking" && brain.purpose === "workout");

/** Head for the first reachable spot by the board; with none reachable, stand right here. */
function joinMeeting(event: Tick, world: BrainWorld): Brain {
	for (const spot of world.meetingSpots) {
		const walk = walkTo(world, event.position, spot, "meeting");
		if (walk) return walk;
	}
	return { mode: "meeting", at: { position: event.position, rotationY: FACE_CAMERA } };
}

const inMeeting = (brain: Brain): boolean =>
	brain.mode === "meeting" || (brain.mode === "walking" && brain.purpose === "meeting");

/** A seated agent stays put while busy, and wanders off once it has been idle long enough. */
function whileSeated(
	brain: Extract<Brain, { mode: "seated" }>,
	event: Tick,
	world: BrainWorld,
): Brain {
	const { now } = event;
	if (isBusy(event.status))
		return {
			mode: "seated",
			nextOutingAt: Math.max(brain.nextOutingAt, now + TIMING.firstOuting[0]),
		};
	if (now < brain.nextOutingAt) return brain;
	const spot = world.pickSpot(world.random);
	const outing = spot ? walkTo(world, world.seat.position, spot, "outing") : undefined;
	return outing ?? sitDown(now, world);
}

const visitOf = (brain: Brain): VisitWindow | undefined =>
	brain.mode === "walking" || brain.mode === "hanging" ? brain.visit : undefined;

/**
 * Delivering a message in person: walk to the colleague whatever the herdr
 * status says (the agent's turn keeps running in its terminal), chat until
 * the visit is over, then go back.
 */
function whileVisiting(brain: Brain, event: Tick, world: BrainWorld): Brain | undefined {
	const { visit, now } = event;
	const active = visit !== undefined && now < visit.until ? visit : undefined;
	const current = visitOf(brain);
	if (active && current?.id !== active.id) {
		const path = world.route(event.position, active.at.position);
		return path
			? { mode: "walking", purpose: "visit", path, goal: active.at, visit: active }
			: undefined;
	}
	if (!current) return undefined;
	return now >= current.until ? goHome(event, world) : brain;
}

/**
 * The office-wide signals: a workout overrides everything, then a brainstorm;
 * when either ends the agent heads home. Undefined when neither concerns it.
 */
function whileGathering(brain: Brain, event: Tick, world: BrainWorld): Brain | undefined {
	const { workout, now } = event;
	const workingOut = workout !== undefined && now >= workout.start && now < workout.end;
	if (workingOut) return inWorkout(brain) ? brain : joinWorkout(event, world);
	if (event.meeting) return inMeeting(brain) ? brain : joinMeeting(event, world);
	if (inWorkout(brain) || inMeeting(brain)) return goHome(event, world);
	return undefined;
}

function onTick(brain: Brain, event: Tick, world: BrainWorld): Brain {
	const gathering = whileGathering(brain, event, world);
	if (gathering) return gathering;
	const visiting = whileVisiting(brain, event, world);
	if (visiting) return visiting;
	const { now } = event;
	if (brain.mode === "seated") return whileSeated(brain, event, world);
	const busy = isBusy(event.status);
	const headHome =
		(brain.mode === "walking" && brain.purpose === "outing" && busy) ||
		(brain.mode === "hanging" && (busy || now >= brain.until));
	return headHome ? goHome(event, world) : brain;
}

/** Pure transition function for one agent's behaviour. */
export function stepBrain(brain: Brain, event: BrainEvent, world: BrainWorld): Brain {
	if (event.type === "tick") return onTick(brain, event, world);
	if (brain.mode !== "walking") return brain;
	if (brain.purpose === "return") return sitDown(event.now, world);
	if (brain.purpose === "workout") return { mode: "exercising", at: brain.goal };
	if (brain.purpose === "meeting") return { mode: "meeting", at: brain.goal };
	if (brain.visit)
		return { mode: "hanging", at: brain.goal, until: brain.visit.until, visit: brain.visit };
	return {
		mode: "hanging",
		at: brain.goal,
		until: event.now + between(world.random, TIMING.linger),
	};
}
