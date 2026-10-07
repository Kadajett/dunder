import { BALL_COLORS, JEREMY, type PoolSide, type PoolView } from "@shared/pool";
import type { CSSProperties } from "react";

const CLOTH_WHITE = "#f4f1e8";

/** A ball as a dot: solid colour, or a white ball with a coloured band for a stripe. */
function dotStyle(id: number): CSSProperties {
	const base = BALL_COLORS[id > 8 ? id - 8 : id] ?? "#888";
	if (id <= 8) return { background: base };
	return {
		background: `linear-gradient(${CLOTH_WHITE} 0 26%, ${base} 26% 74%, ${CLOTH_WHITE} 74%)`,
	};
}

function SideCard({ side, shooter }: { readonly side: PoolSide; readonly shooter: string | null }) {
	return (
		<span className="pool-side">
			<span className="pool-players">
				{side.players.map((player) => (
					<span key={player} className="pool-player" data-shooter={player === shooter}>
						{player === JEREMY ? "You" : player}
					</span>
				))}
			</span>
			{side.group ? (
				<span className="pool-dots" title={`${side.group}, ${side.left.length} left`}>
					{(side.left.length > 0 ? side.left : [8]).map((id) => (
						<i key={id} style={dotStyle(id)} />
					))}
				</span>
			) : (
				<span className="pool-open">open table</span>
			)}
		</span>
	);
}

function resultLine(view: PoolView): string | null {
	if (view.stage !== "finished" || !view.result) return null;
	const { winner, players, reason } = view.result;
	if (winner === null) return `Draw · ${reason}`;
	if (players.includes(JEREMY)) return `You win! · ${reason}`;
	return `${players.join(" + ")} ${players.length === 1 ? "wins" : "win"} · ${reason}`;
}

export interface PoolHudProps {
	readonly view: PoolView;
	/** What Jeremy should do now, on his turn. */
	readonly prompt: string | null;
	/** The last join/leave/shoot failure, one line. */
	readonly message: string | null;
	readonly onJoin: () => void;
	readonly onLeave: () => void;
}

/** The strip over the table view: sides and groups, whose shot, the last shot, join/leave. */
export function PoolHud({ view, prompt, message, onJoin, onLeave }: PoolHudProps) {
	const banner = resultLine(view);
	return (
		<div className="pool-hud">
			<div className="pool-hud-row">
				{view.sides.length > 0 ? (
					view.sides.map((side, index) => (
						// Sides are positional (side 0, side 1) for the whole game.
						// biome-ignore lint/suspicious/noArrayIndexKey: a side has no other identity
						<SideCard key={index} side={side} shooter={view.shooter} />
					))
				) : (
					<span className="pool-open">Table free · join to start practice</span>
				)}
				{view.jeremy.joined ? (
					<button type="button" className="pool-button" onClick={onLeave}>
						{view.mode === "practice" ? "End practice" : "Leave"}
					</button>
				) : (
					<button type="button" className="pool-button" data-primary onClick={onJoin}>
						Join
					</button>
				)}
			</div>
			{banner ? <div className="pool-banner">{banner}</div> : null}
			{prompt ? <div className="pool-prompt">{prompt}</div> : null}
			{view.last ? <div className="pool-last">{view.last.text}</div> : null}
			{message ? (
				<div className="pool-error" role="alert">
					{message}
				</div>
			) : null}
		</div>
	);
}
