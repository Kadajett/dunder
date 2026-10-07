import "../office/focus/focus.css";
import "./table-view.css";
import {
	CUE_BALL,
	canPlaceCue,
	type PocketId,
	type PoolActionResult,
	type PoolBall,
	type PoolShotInput,
	type PoolView,
} from "@shared/pool";
import { useEffect, useState } from "react";
import { useChief } from "../chief/chief-store";
import { isLeaveChord, LEAVE_CHORD_LABEL } from "../office/focus/FocusOverlay";
import { type ScreenRect, useFocus } from "../office/focus/focus-store";
import { AimLayer } from "./AimLayer";
import { startingCue } from "./aim";
import { PoolHud } from "./PoolHud";
import { ballsNow, usePool } from "./pool-store";
import type { TablePoint } from "./table-space";

/** Pockets as they sit on screen (head end left, table +y up). */
const POCKET_NAMES: Readonly<Record<PocketId, string>> = {
	tl: "top-left",
	tm: "top side",
	tr: "top-right",
	bl: "bottom-left",
	bm: "bottom side",
	br: "bottom-right",
};

type Run = (action: () => Promise<PoolActionResult>) => void;

/** What Jeremy has to do before (or for) his shot. */
function turnPrompt(view: PoolView, placedLegally: boolean, called: PocketId | null): string {
	const steps: string[] = [];
	if (view.ballInHand) {
		steps.push(
			placedLegally ? "Place the cue ball (drag it)" : "Place the cue ball on a free spot",
		);
	}
	if (view.onEight) {
		steps.push(called ? `Calling the ${POCKET_NAMES[called]} pocket` : "Call a pocket for the 8");
	}
	if (steps.length === 0 || (placedLegally && (!view.onEight || called))) steps.push("Your shot");
	return steps.join(" · ");
}

interface TurnProps {
	readonly cloth: ScreenRect;
	readonly view: PoolView;
	readonly balls: readonly PoolBall[];
	readonly message: string | null;
	readonly run: Run;
}

/** One visit at the table: the ball-in-hand spot and the called pocket reset with every shot. */
function TableTurn({ cloth, view, balls, message, run }: TurnProps) {
	const [spot, setSpot] = useState<TablePoint | null>(() =>
		view.ballInHand ? startingCue(balls, view.ballInHand) : null,
	);
	const [called, setCalled] = useState<PocketId | null>(null);
	const interactive = view.stage === "playing" && view.jeremy.yourTurn && !view.moving;
	const lying = balls.find((ball) => ball.id === CUE_BALL && ball.pocket === null);
	const cue = view.ballInHand ? spot : lying ? { x: lying.x, y: lying.y } : null;
	const placedLegally =
		!view.ballInHand || (spot !== null && canPlaceCue(balls, spot, view.ballInHand));
	const ready = interactive && cue !== null && placedLegally && (!view.onEight || called !== null);
	const shoot = (angle: number, power: number): void => {
		const input: PoolShotInput = {
			angle,
			power,
			...(view.ballInHand && spot ? { cue: spot } : {}),
			...(view.onEight && called ? { calledPocket: called } : {}),
		};
		run(() => window.office.pool.shoot(input));
	};
	return (
		<>
			<PoolHud
				view={view}
				prompt={interactive ? turnPrompt(view, placedLegally, called) : null}
				message={message}
				onJoin={() => run(() => window.office.pool.join())}
				onLeave={() => run(() => window.office.pool.leave())}
			/>
			<AimLayer
				cloth={cloth}
				balls={balls}
				cue={cue}
				interactive={interactive}
				inHand={view.ballInHand}
				placedLegally={placedLegally}
				onPlace={setSpot}
				onEight={view.onEight}
				called={called}
				onCall={setCalled}
				ready={ready}
				onShoot={shoot}
			/>
		</>
	);
}

/** The table as it plays right now, plus the last failed action's reason. */
function TablePlay({ cloth }: { readonly cloth: ScreenRect }) {
	const view = usePool((state) => state.view);
	const frame = usePool((state) => state.frame);
	const [message, setMessage] = useState<string | null>(null);
	if (!view) return null;
	const run: Run = (action) => {
		setMessage(null);
		void action().then(
			(result) => setMessage(result.ok ? null : result.reason),
			(error: unknown) => setMessage(error instanceof Error ? error.message : String(error)),
		);
	};
	return (
		<TableTurn
			key={`${view.stage}:${view.shot}:${view.turn}:${view.ballInHand}`}
			cloth={cloth}
			view={view}
			balls={ballsNow(view, frame)}
			message={message}
			run={run}
		/>
	);
}

/** Esc or the focus chord leaves: no terminal here needs Esc. */
function useLeaveKeys(active: boolean, leave: () => void): void {
	useEffect(() => {
		if (!active) return;
		const onKey = (event: KeyboardEvent): void => {
			if (event.key !== "Escape" && !isLeaveChord(event)) return;
			event.preventDefault();
			event.stopPropagation();
			leave();
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [active, leave]);
}

/** Tell main Jeremy is at the table while the view is settled: out of it, autopilot plays his visits. */
function useViewing(settled: boolean): void {
	useEffect(() => {
		if (!settled || !("pool" in window.office)) return;
		const pool = window.office.pool;
		void pool.setViewing(true);
		return () => {
			void pool.setViewing(false);
		};
	}, [settled]);
}

/**
 * Jeremy's table view: the camera above the pool table, a click-catching
 * backdrop (click outside the table to leave), the game strip on top and the
 * aiming layer over the cloth. Mount once, in the office view.
 */
export function TableView() {
	const phase = useFocus((state) => (state.target?.kind === "table" ? state.phase : null));
	const rect = useFocus((state) => state.rect);
	const leave = useFocus((state) => state.leave);
	const dockOpen = useChief((state) => state.expanded);
	const settled = phase === "focused";
	useLeaveKeys(phase !== null, leave);
	useViewing(settled);

	if (phase === null) return null;
	return (
		<div className="focus-layer" data-phase={phase} data-dock={dockOpen ? "open" : "closed"}>
			<button
				type="button"
				className="focus-backdrop"
				aria-label="Back to office"
				onClick={leave}
			/>
			{settled && rect ? <TablePlay cloth={rect} /> : null}
			<div className="focus-bar">
				<button type="button" className="focus-back" onClick={leave}>
					← Back to office
				</button>
				<span className="focus-title">
					<strong>POOL</strong> · table view
				</span>
				<span className="focus-hint">
					point to aim · press and pull back to shoot · click outside, Esc or{" "}
					<kbd>{LEAVE_CHORD_LABEL}</kbd> to leave
				</span>
			</div>
		</div>
	);
}
