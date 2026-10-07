import { useFrame } from "@react-three/fiber";
import { WORKOUT_SECONDS, type Workout } from "@shared/calisthenics";
import type { AgentStatus } from "@shared/herdr/schema";
import type { Vec2 } from "@shared/layout/schema";
import { type ReactNode, useRef, useState } from "react";
import type { Group } from "three";
import { inBrainstorm } from "../../brainstorm/brainstorm-store";
import { useAgentWorkout } from "../../calisthenics/workout-store";
import { useAgentStyle } from "../../hire/roster-store";
import { usePool } from "../../pool/pool-store";
import { standingSpots, type TablePlacement } from "../../pool/table-space";
import {
	type Brain,
	type BrainWorld,
	initialBrain,
	stepBrain,
	type WorkoutWindow,
} from "../behaviour/brain";
import { useConversations, visitFor } from "../conversations/conversation-store";
import { NameRing } from "../labels/NameRing";
import type { LiveAgent } from "../model/live-agents";
import { type Placement, STATION_SCALE } from "../scene/station";
import { type MiiActivity, MiiCharacter, type MiiPose } from "./MiiCharacter";

const WALK_SPEED = 1.35;
const TURN_RATE = 10;
const THINK_EVERY = 0.75;

/** Each status reads from across the room: typing, slumped (blocked), stretching (done). */
const STATUS_ACTIVITY: Record<AgentStatus, MiiActivity> = {
	working: "typing",
	blocked: "slumped",
	idle: "idle",
	done: "stretching",
	unknown: "idle",
};

/**
 * Body language for a status in a mode: at the pool table the cue, typing
 * needs the desk, walking and workouts drive the body themselves.
 */
export function activityFor(mode: Brain["mode"], status: AgentStatus): MiiActivity {
	if (mode === "playing") return "cue";
	if (mode === "walking" || mode === "exercising") return "idle";
	const activity = STATUS_ACTIVITY[status];
	return activity === "typing" && mode !== "seated" ? "idle" : activity;
}

const POSE: Record<Brain["mode"], MiiPose> = {
	seated: "seated",
	walking: "walking",
	hanging: "standing",
	exercising: "exercising",
	meeting: "standing",
	playing: "standing",
};

interface Walk {
	readonly segment: number;
	/** Distance covered along the current segment. */
	readonly along: number;
}

interface Stride {
	readonly walk: Walk;
	readonly position: Vec2 | undefined;
	readonly heading: number | undefined;
	readonly done: boolean;
}

/** Move `distance` further along `path` from `walk`. */
function advance(path: readonly Vec2[], walk: Walk, distance: number): Stride {
	let { segment, along } = walk;
	along += distance;
	for (;;) {
		const a = path[segment];
		const b = path[segment + 1];
		if (!a || !b)
			return { walk: { segment, along: 0 }, position: path.at(-1), heading: undefined, done: true };
		const length = Math.hypot(b.x - a.x, b.z - a.z);
		if (along <= length) {
			const t = length === 0 ? 1 : along / length;
			const position = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
			return {
				walk: { segment, along },
				position,
				heading: Math.atan2(b.x - a.x, b.z - a.z),
				done: false,
			};
		}
		along -= length;
		segment += 1;
	}
}

/** Shortest signed angle from `from` to `to`. */
function angleDelta(from: number, to: number): number {
	return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

interface BodyTarget {
	readonly position: Vec2 | undefined;
	readonly heading: number | undefined;
	readonly walk: Walk;
	readonly arrived: boolean;
}

/** Where the body belongs this frame: resting at a placement, or `distance` further along its walk. */
function bodyTarget(brain: Brain, seat: Placement, walk: Walk, distance: number): BodyTarget {
	if (brain.mode === "walking") {
		const stride = advance(brain.path, walk, distance);
		return {
			position: stride.position,
			heading: stride.heading,
			walk: stride.walk,
			arrived: stride.done,
		};
	}
	const rest = brain.mode === "seated" ? seat : brain.at;
	return { position: rest.position, heading: rest.rotationY, walk, arrived: false };
}

/** The workout on the frame clock (seconds); all participants share its wall-clock start. */
function workoutWindow(workout: Workout | undefined, now: number): WorkoutWindow | undefined {
	if (!workout) return undefined;
	const start = now - (Date.now() - workout.startedAt) / 1_000;
	return { start, end: start + WORKOUT_SECONDS };
}

export interface AgentActorProps {
	readonly agent: LiveAgent;
	readonly world: BrainWorld;
	readonly phase: number;
	/** Where the office pool table stands; the engine's game seats idle agents at it. */
	readonly poolTable: TablePlacement | null;
	/** Extra content that travels with the body (e.g. a speech bubble), in body-local space. */
	readonly overlay?: ReactNode;
}

/** A live agent's body: sits and works at its desk, wanders when idle, joins workouts, plays pool. */
export function AgentActor({ agent, world, phase, poolTable, overlay }: AgentActorProps) {
	const style = useAgentStyle(agent.name);
	const brain = useRef<Brain>(initialBrain(0, world.random));
	const [mode, setMode] = useState<Brain["mode"]>(brain.current.mode);
	const body = useRef<Group>(null);
	// The name ring follows the body's position but not its turning, so it keeps facing the camera.
	const feet = useRef<Group>(null);
	const walk = useRef<Walk>({ segment: 0, along: 0 });
	const thinkAt = useRef(0);
	const status = useRef(agent.status);
	status.current = agent.status;
	const workout = useAgentWorkout(agent.name);
	const workoutRef = useRef(workout);
	workoutRef.current = workout;

	const change = (next: Brain): void => {
		if (next === brain.current) return;
		brain.current = next;
		walk.current = { segment: 0, along: 0 };
		setMode(next.mode);
	};

	useFrame((state, delta) => {
		const group = body.current;
		if (!group) return;
		const now = state.clock.elapsedTime;
		const current = brain.current;
		const target = bodyTarget(current, world.seat, walk.current, delta * WALK_SPEED);
		walk.current = target.walk;
		if (target.position) {
			group.position.set(target.position.x, 0, target.position.z);
			feet.current?.position.set(target.position.x, 0, target.position.z);
		}
		if (target.heading !== undefined) {
			const turn = Math.min(1, delta * TURN_RATE);
			group.rotation.set(
				0,
				group.rotation.y + angleDelta(group.rotation.y, target.heading) * turn,
				0,
			);
		}
		if (target.arrived) change(stepBrain(current, { type: "arrived", now }, world));
		if (now < thinkAt.current) return;
		thinkAt.current = now + THINK_EVERY;
		const position = { x: group.position.x, z: group.position.z };
		const signal = workoutWindow(workoutRef.current, now);
		const clock = { nowMs: Date.now(), brainNow: now };
		const visit = visitFor(
			useConversations.getState().heard,
			agent.name,
			clock,
			world.colleagueSpot,
		);
		const pool = poolTable
			? standingSpots(poolTable, usePool.getState().view).get(agent.name)
			: undefined;
		const tick = {
			type: "tick",
			status: status.current,
			now,
			position,
			workout: signal,
			visit,
			meeting: inBrainstorm(agent.name),
			pool,
		} as const;
		change(stepBrain(brain.current, tick, world));
	});

	const activity = activityFor(mode, agent.status);
	return (
		<>
			<group
				ref={body}
				position={[world.seat.position.x, 0, world.seat.position.z]}
				rotation={[0, world.seat.rotationY, 0]}
				scale={STATION_SCALE}
			>
				<MiiCharacter
					style={style}
					pose={POSE[mode]}
					activity={activity}
					phase={phase}
					workoutStartedAt={workout?.startedAt ?? 0}
				/>
				{overlay}
			</group>
			<group ref={feet} position={[world.seat.position.x, 0, world.seat.position.z]}>
				<NameRing name={agent.name} status={agent.status} paneId={agent.paneId} />
			</group>
		</>
	);
}
