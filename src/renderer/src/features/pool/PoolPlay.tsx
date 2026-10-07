import "./pool-label.css";
import { Html, useCursor } from "@react-three/drei";
import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { POOL_TABLE, type PoolFrame } from "@shared/pool";
import { type ReactNode, useRef, useState } from "react";
import { Euler, type Group, Quaternion, Vector3 } from "three";
import { CueStick } from "../office/decor/cue-stick";
import { type BallSpots, POOL_SURFACE_Y, PoolBalls } from "../office/decor/pool-balls";
import { restingRack } from "../office/decor/pool-rack";
import { useFocus } from "../office/focus/focus-store";
import { DYNAMIC } from "../office/scene/StaticBatch";
import { enterTableView } from "./enter-table-view";
import { latestFrame, spotsNow, tableSpots, usePool } from "./pool-store";
import { cueTip, type Strike, strikeOf } from "./stroke";

/** Before main answers (or without the pool API): a fresh rack. */
const RESTING_SPOTS = tableSpots(restingRack());

/** The balls to draw this frame; read outside React, so rolling balls never re-render anything. */
function currentSpots(): BallSpots {
	const view = usePool.getState().view;
	return view ? spotsNow(view, latestFrame()) : RESTING_SPOTS;
}
/** The label floats this high over the cloth (table metres): above the players' heads, clear of the far rail. */
const LABEL_HEIGHT = 2.3;
/** Hover ring round the table on the floor (table metres, before the station scale). */
const RING = 1.45;

const position = new Vector3();
const turn = new Quaternion();
const euler = new Euler();

/** The house cue during a strike: thrust through the cue ball the way it went, gone once the stroke is over. */
function Stroke() {
	const group = useRef<Group>(null);
	const seen = useRef<PoolFrame | null>(null);
	const first = useRef<PoolFrame | null>(null);
	const strike = useRef<Strike | null>(null);
	useFrame(() => {
		const cue = group.current;
		const frame = latestFrame();
		if (!cue || frame === seen.current) return;
		seen.current = frame;
		if (frame && first.current?.shot !== frame.shot) {
			first.current = frame;
			strike.current = null;
		}
		if (frame && first.current && !strike.current) strike.current = strikeOf(first.current, frame);
		const current = strike.current;
		const tip = current && frame?.shot === current.shot ? cueTip(current, frame.t) : null;
		cue.visible = tip !== null;
		if (!current || !tip) return;
		cue.position.set(tip.x, POOL_SURFACE_Y + POOL_TABLE.ballRadius, -tip.y);
		cue.rotation.set(0, current.angle, 0);
	});
	return (
		<group ref={group} userData={DYNAMIC} visible={false}>
			<CueStick />
		</group>
	);
}

/** 'theo + nora vs mika · solids 4 left · stripes 6 left' over the table; none while it rests or in table view (the strip says it). */
function TableLabel() {
	const label = usePool((state) => state.view?.label ?? "");
	const tableView = useFocus((state) => state.target?.kind === "table");
	if (!label || tableView) return null;
	return (
		<Html
			position={[0, LABEL_HEIGHT, 0]}
			center
			zIndexRange={[20, 10]}
			style={{ pointerEvents: "none" }}
		>
			<div className="pool-label">{label}</div>
		</Html>
	);
}

/**
 * Play on the table, in table space (inside the table's scaled group): the
 * balls where the engine has them, rolling with its frames; the cue's stroke;
 * the in-world label. The house cue lies on the cloth only while nobody plays.
 */
export function PoolPlay({ restingCue }: { readonly restingCue: ReactNode }) {
	const resting = usePool((state) => !state.view || state.view.stage === "resting");
	return (
		<>
			{resting ? restingCue : null}
			<PoolBalls read={currentSpots} />
			<Stroke />
			<TableLabel />
		</>
	);
}

/** The table's click target: hover shows a ring, a click opens Jeremy's table view over it. */
export function PoolTableClick({ children }: { readonly children: ReactNode }) {
	const [hovered, setHovered] = useState(false);
	useCursor(hovered);
	const open = (event: ThreeEvent<MouseEvent>): void => {
		event.stopPropagation();
		// The table's own transform (edit mode may have moved it) places the view.
		event.eventObject.getWorldPosition(position);
		event.eventObject.getWorldQuaternion(turn);
		const angle = euler.setFromQuaternion(turn, "YXZ").y;
		enterTableView({ center: { x: position.x, z: position.z }, angle });
	};
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: a three.js <group>, not DOM; R3F delivers raycast pointer events.
		<group
			onClick={open}
			onPointerOver={(event: ThreeEvent<PointerEvent>) => {
				event.stopPropagation();
				setHovered(true);
			}}
			onPointerOut={() => setHovered(false)}
		>
			{children}
			{hovered ? (
				<mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} userData={DYNAMIC}>
					<ringGeometry args={[RING, RING + 0.07, 48]} />
					<meshBasicMaterial color="#f2c66d" transparent opacity={0.9} toneMapped={false} />
				</mesh>
			) : null}
		</group>
	);
}
