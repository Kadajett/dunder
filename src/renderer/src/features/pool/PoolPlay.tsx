import "./pool-label.css";
import { Html, useCursor } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { POOL_TABLE, type PoolFrame } from "@shared/pool";
import { type ReactNode, useRef, useState } from "react";
import { Euler, Quaternion, Vector3 } from "three";
import { CueStick } from "../office/decor/cue-stick";
import { POOL_SURFACE_Y, PoolBalls } from "../office/decor/pool-balls";
import { restingRack } from "../office/decor/pool-rack";
import { useFocus } from "../office/focus/focus-store";
import { DYNAMIC } from "../office/scene/StaticBatch";
import { enterTableView } from "./enter-table-view";
import { ballsNow, usePool } from "./pool-store";
import { cueTip, type Strike, strikeOf } from "./stroke";

const RESTING_RACK = restingRack();
/** The label floats this high over the cloth (table metres): above the players' heads, clear of the far rail. */
const LABEL_HEIGHT = 2.3;
/** Hover ring round the table on the floor (table metres, before the station scale). */
const RING = 1.45;

const position = new Vector3();
const turn = new Quaternion();
const euler = new Euler();

/** The house cue during a strike: thrust through the cue ball the way it went, gone once the stroke is over. */
function Stroke() {
	const frame = usePool((state) => state.frame);
	const first = useRef<PoolFrame | null>(null);
	const strike = useRef<Strike | null>(null);
	if (frame && first.current?.shot !== frame.shot) {
		first.current = frame;
		strike.current = null;
	}
	if (frame && first.current && !strike.current) strike.current = strikeOf(first.current, frame);
	const current = strike.current;
	const tip = current && frame?.shot === current.shot ? cueTip(current, frame.t) : null;
	if (!current || !tip) return null;
	return (
		<group
			userData={DYNAMIC}
			position={[tip.x, POOL_SURFACE_Y + POOL_TABLE.ballRadius, -tip.y]}
			rotation={[0, current.angle, 0]}
		>
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
	const view = usePool((state) => state.view);
	const frame = usePool((state) => state.frame);
	const balls = view ? ballsNow(view, frame) : RESTING_RACK;
	return (
		<>
			{!view || view.stage === "resting" ? restingCue : null}
			<PoolBalls balls={balls} />
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
