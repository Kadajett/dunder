import {
	HEAD_STRING_X,
	POCKET_IDS,
	POCKETS,
	POOL_TABLE,
	type PocketId,
	type PoolBall,
} from "@shared/pool";
import { type PointerEvent as ReactPointerEvent, useState } from "react";
import type { ScreenRect } from "../office/focus/focus-store";
import {
	angleTo,
	direction,
	firstContact,
	MAX_PULL_METRES,
	MIN_SHOT_POWER,
	pullPower,
} from "./aim";
import { TABLE_OUTER, type TablePoint } from "./table-space";
import { outerRect, pxToTable, tableToPx } from "./table-view";

const R = POOL_TABLE.ballRadius;
/** Pressing this close to a ball-in-hand cue ball picks it up instead of starting a shot. */
const GRAB = 3 * R;
/** Gap between the cue tip and the ball at rest, and the drawn cue's length, in table metres. */
const CUE_GAP = 0.02;
const CUE_LENGTH = 1.1;
const POCKET_MARK = 0.07;

type Drag =
	| { readonly kind: "place" }
	| { readonly kind: "pull"; readonly press: TablePoint; readonly power: number };

export interface AimLayerProps {
	readonly cloth: ScreenRect;
	readonly balls: readonly PoolBall[];
	/** Where the cue ball is (or is being placed); null when it is off the table. */
	readonly cue: TablePoint | null;
	/** It is Jeremy's shot and the balls are still. */
	readonly interactive: boolean;
	/** Ball in hand: the kitchen to shade, or anywhere. */
	readonly inHand: "kitchen" | "anywhere" | null;
	readonly placedLegally: boolean;
	readonly onPlace: (spot: TablePoint) => void;
	/** Pockets to offer for calling the 8, and the one called. */
	readonly onEight: boolean;
	readonly called: PocketId | null;
	readonly onCall: (pocket: PocketId) => void;
	/** Everything a shot needs is set (legal placement, called pocket). */
	readonly ready: boolean;
	readonly onShoot: (angle: number, power: number) => void;
}

/** Kitchen shading and the head string, while the cue ball goes behind it. */
function Kitchen() {
	const left = -POOL_TABLE.length / 2;
	const half = POOL_TABLE.width / 2;
	return (
		<g className="pool-kitchen">
			<rect x={left} y={-half} width={HEAD_STRING_X - left} height={2 * half} />
			<line x1={HEAD_STRING_X} y1={-half} x2={HEAD_STRING_X} y2={half} />
		</g>
	);
}

/** Pocket buttons for calling the 8, over the table's pockets (DOM, so they are real buttons). */
function PocketMarks({
	cloth,
	called,
	onCall,
}: Pick<AimLayerProps, "cloth" | "called" | "onCall">) {
	const size = 2 * POCKET_MARK * (cloth.width / POOL_TABLE.length);
	return POCKET_IDS.map((id) => {
		const at = tableToPx(cloth, POCKETS[id]);
		return (
			<button
				key={id}
				type="button"
				className="pool-pocket"
				data-called={id === called}
				aria-label={`Call the ${id} pocket for the 8`}
				aria-pressed={id === called}
				style={{ left: at.x - size / 2, top: at.y - size / 2, width: size, height: size }}
				onClick={() => onCall(id)}
			/>
		);
	});
}

/** The guide to the first ball or cushion, a ghost ball there, and the cue drawn back by the pull. */
function Guide({
	cue,
	angle,
	pull,
	balls,
}: {
	readonly cue: TablePoint;
	readonly angle: number;
	readonly pull: number;
	readonly balls: readonly PoolBall[];
}) {
	const contact = firstContact(cue, angle, balls);
	const aim = direction(angle);
	const tip = R + CUE_GAP + pull * MAX_PULL_METRES;
	const butt = tip + CUE_LENGTH;
	return (
		<g className="pool-guide">
			<line x1={cue.x} y1={-cue.y} x2={contact.at.x} y2={-contact.at.y} />
			{contact.kind === "ball" ? (
				<circle className="pool-ghost" cx={contact.at.x} cy={-contact.at.y} r={R} />
			) : null}
			<line
				className="pool-cue"
				x1={cue.x - aim.x * tip}
				y1={-(cue.y - aim.y * tip)}
				x2={cue.x - aim.x * butt}
				y2={-(cue.y - aim.y * butt)}
			/>
		</g>
	);
}

/**
 * Jeremy's aiming surface, an SVG in table metres laid over the table's rim:
 * drag the cue ball with ball in hand, click a pocket to call the 8, point to
 * aim, press and pull back against the aim to set the power, release to shoot.
 */
export function AimLayer(props: AimLayerProps) {
	const { cloth, cue, interactive } = props;
	const [angle, setAngle] = useState(0);
	const [drag, setDrag] = useState<Drag | null>(null);
	const rim = outerRect(cloth);
	const pull = drag?.kind === "pull" ? drag.power : 0;

	const toTable = (event: ReactPointerEvent<SVGSVGElement>): TablePoint => {
		const box = event.currentTarget.getBoundingClientRect();
		const x = event.clientX - box.left + rim.left;
		return pxToTable(cloth, { x, y: event.clientY - box.top + rim.top });
	};
	const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
		const point = toTable(event);
		if (drag?.kind === "place") props.onPlace(point);
		else if (drag?.kind === "pull")
			setDrag({ ...drag, power: pullPower(drag.press, point, angle) });
		else if (interactive && cue && Math.hypot(point.x - cue.x, point.y - cue.y) > R) {
			setAngle(angleTo(cue, point));
		}
	};
	const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
		if (event.button !== 0 || !interactive || !cue) return;
		const point = toTable(event);
		const grab = props.inHand !== null && Math.hypot(point.x - cue.x, point.y - cue.y) <= GRAB;
		if (!grab && !props.ready) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		setDrag(grab ? { kind: "place" } : { kind: "pull", press: point, power: 0 });
	};
	const onPointerUp = (): void => {
		if (drag?.kind === "pull" && drag.power > MIN_SHOT_POWER) props.onShoot(angle, drag.power);
		setDrag(null);
	};

	return (
		<>
			<svg
				className="pool-aim"
				data-interactive={interactive}
				data-drag={drag?.kind ?? "none"}
				style={{ left: rim.left, top: rim.top, width: rim.width, height: rim.height }}
				viewBox={`${-TABLE_OUTER.x} ${-TABLE_OUTER.y} ${2 * TABLE_OUTER.x} ${2 * TABLE_OUTER.y}`}
				preserveAspectRatio="none"
				role="application"
				aria-label="Pool table: aim, then press and pull back to shoot"
				onPointerMove={onPointerMove}
				onPointerDown={onPointerDown}
				onPointerUp={onPointerUp}
				onPointerCancel={() => setDrag(null)}
				onContextMenu={(event) => {
					event.preventDefault();
					setDrag(null);
				}}
			>
				{interactive && props.inHand === "kitchen" ? <Kitchen /> : null}
				{interactive && cue && drag?.kind !== "place" ? (
					<Guide cue={cue} angle={angle} pull={pull} balls={props.balls} />
				) : null}
				{interactive && props.inHand && cue ? (
					<g className="pool-in-hand" data-legal={props.placedLegally}>
						<circle className="pool-grab" cx={cue.x} cy={-cue.y} r={GRAB} />
						<circle className="pool-cue-ball" cx={cue.x} cy={-cue.y} r={R} />
					</g>
				) : null}
			</svg>
			{interactive && props.onEight ? (
				<PocketMarks cloth={cloth} called={props.called} onCall={props.onCall} />
			) : null}
			{drag?.kind === "pull" ? (
				<div
					className="pool-power"
					style={{ left: rim.left + rim.width + 14, top: rim.top, height: rim.height }}
				>
					<span style={{ height: `${Math.round(pull * 100)}%` }} />
					<b>{Math.round(pull * 100)}%</b>
				</div>
			) : null}
		</>
	);
}
