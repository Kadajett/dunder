import { useFrame } from "@react-three/fiber";
import { avatarStyleFor } from "@shared/avatar/style";
import type { AgentStatus } from "@shared/herdr/schema";
import type { Vec2 } from "@shared/layout/schema";
import { useMemo, useRef, useState } from "react";
import type { Group } from "three";
import { type Brain, type BrainWorld, initialBrain, stepBrain } from "../behaviour/brain";
import { NameTag } from "../labels/Labels";
import type { LiveAgent } from "../model/live-agents";
import { type Placement, STATION_SCALE } from "../scene/station";
import { MiiCharacter, type MiiPose } from "./MiiCharacter";

const WALK_SPEED = 1.35;
const TURN_RATE = 10;
const THINK_EVERY = 0.75;

const SEATED_ACTIVITY: Record<AgentStatus, "typing" | "idle" | "waving"> = {
	working: "typing",
	blocked: "waving",
	idle: "idle",
	done: "idle",
	unknown: "idle",
};

const POSE: Record<Brain["mode"], MiiPose> = {
	seated: "seated",
	walking: "walking",
	hanging: "standing",
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

export interface AgentActorProps {
	readonly agent: LiveAgent;
	readonly world: BrainWorld;
	readonly phase: number;
}

/** A live agent's body: sits and works at its desk, wanders when idle. */
export function AgentActor({ agent, world, phase }: AgentActorProps) {
	const style = useMemo(() => avatarStyleFor(agent.name), [agent.name]);
	const brain = useRef<Brain>(initialBrain(0, world.random));
	const [mode, setMode] = useState<Brain["mode"]>(brain.current.mode);
	const body = useRef<Group>(null);
	const walk = useRef<Walk>({ segment: 0, along: 0 });
	const thinkAt = useRef(0);
	const status = useRef(agent.status);
	status.current = agent.status;

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
		if (target.position) group.position.set(target.position.x, 0, target.position.z);
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
		change(
			stepBrain(brain.current, { type: "tick", status: status.current, now, position }, world),
		);
	});

	const activity = mode === "seated" ? SEATED_ACTIVITY[agent.status] : "idle";
	return (
		<group
			ref={body}
			position={[world.seat.position.x, 0, world.seat.position.z]}
			rotation={[0, world.seat.rotationY, 0]}
			scale={STATION_SCALE}
		>
			<MiiCharacter style={style} pose={POSE[mode]} activity={activity} phase={phase} />
			<NameTag
				position={[0, mode === "seated" ? 1.62 : 1.85, 0]}
				name={agent.name}
				status={agent.status}
			/>
		</group>
	);
}
