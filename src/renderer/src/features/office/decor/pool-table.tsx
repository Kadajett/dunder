import { POOL_TABLE } from "@shared/pool";
import { DYNAMIC } from "../scene/StaticBatch";
import { STATION_SCALE } from "../scene/station";
import { CueStick } from "./cue-stick";
import { PALETTE } from "./palette";
import { Block } from "./parts";
import { POOL_SURFACE_Y, PoolBalls } from "./pool-balls";
import { restingRack } from "./pool-rack";

/*
 * Table space, in metres before the station scale (the table's group applies
 * STATION_SCALE): the playing surface (inside the cushion noses) is centred on
 * the origin at height POOL_SURFACE_Y, pool x along x (+x the rack end), pool y
 * along -z. Rails, cushions and frame stand outside it. Play (dk7.4) draws in it.
 */
const HALF_L = POOL_TABLE.length / 2;
const HALF_W = POOL_TABLE.width / 2;
const CUSHION = 0.05;
const RAIL = 0.12;
const OUT_L = HALF_L + CUSHION + RAIL;
const OUT_W = HALF_W + CUSHION + RAIL;
const RAIL_TOP = 0.665;
const CUSHION_TOP = 0.655;
const POCKET_TOP = RAIL_TOP + 0.004;

const FELT = "#2f7a58";
const CUSHION_FELT = "#276a4b";
/** Pockets share the office charcoal, so they add no material of their own. */
const POCKET = PALETTE.charcoal;

/** Cushion noses between the pockets: each long rail in two halves, each short rail whole. */
function Cushions() {
	const long = HALF_L - POOL_TABLE.cornerJaw - POOL_TABLE.sideJaw;
	const longX = POOL_TABLE.sideJaw + long / 2;
	const short = POOL_TABLE.width - 2 * POOL_TABLE.cornerJaw;
	const height = CUSHION_TOP - POOL_SURFACE_Y;
	const y = POOL_SURFACE_Y + height / 2;
	return (
		<group>
			{[-1, 1].flatMap((sx) =>
				[-1, 1].map((sz) => (
					<Block
						key={`${sx}:${sz}`}
						size={[long, height, CUSHION]}
						position={[sx * longX, y, sz * (HALF_W + CUSHION / 2)]}
						color={CUSHION_FELT}
					/>
				)),
			)}
			{[-1, 1].map((sx) => (
				<Block
					key={sx}
					size={[CUSHION, height, short]}
					position={[sx * (HALF_L + CUSHION / 2), y, 0]}
					color={CUSHION_FELT}
				/>
			))}
		</group>
	);
}

/** Wooden rails round the cushions, with the sights (diamonds) along their tops. */
function Rails() {
	const height = RAIL_TOP - 0.6;
	const y = 0.6 + height / 2;
	const sights = [-3, -2, -1, 1, 2, 3].map((n) => (n * POOL_TABLE.length) / 8);
	return (
		<group>
			{[-1, 1].map((sz) => (
				<Block
					key={`long${sz}`}
					size={[2 * OUT_L, height, RAIL]}
					position={[0, y, sz * (OUT_W - RAIL / 2)]}
					color={PALETTE.woodDark}
				/>
			))}
			{[-1, 1].map((sx) => (
				<Block
					key={`short${sx}`}
					size={[RAIL, height, 2 * (HALF_W + CUSHION)]}
					position={[sx * (OUT_L - RAIL / 2), y, 0]}
					color={PALETTE.woodDark}
				/>
			))}
			{[-1, 1].flatMap((sz) =>
				sights.map((x) => (
					<Block
						key={`${x}:${sz}`}
						size={[0.022, 0.006, 0.022]}
						position={[x, RAIL_TOP + 0.002, sz * (OUT_W - RAIL / 2)]}
						color={PALETTE.cream}
						noShadow
					/>
				)),
			)}
		</group>
	);
}

/** Six dark mouths: the corners, and the middles of the long rails. */
function Pockets() {
	const height = POCKET_TOP - 0.6;
	const y = 0.6 + height / 2;
	const corner = 0.14;
	return (
		<group>
			{[-1, 1].flatMap((sx) =>
				[-1, 1].map((sz) => (
					<Block
						key={`${sx}:${sz}`}
						size={[corner, height, corner]}
						position={[sx * (HALF_L + 0.035), y, sz * (HALF_W + 0.035)]}
						color={POCKET}
					/>
				)),
			)}
			{[-1, 1].map((sz) => (
				<Block
					key={sz}
					size={[2 * POOL_TABLE.sideJaw, height, 0.12]}
					position={[0, y, sz * (HALF_W + 0.04)]}
					color={POCKET}
				/>
			))}
		</group>
	);
}

/** Frame, legs and felt bed under the rails. */
function Body() {
	const legs: readonly [number, number][] = [
		[-1, -1],
		[-1, 1],
		[1, -1],
		[1, 1],
	];
	return (
		<group>
			<Block size={[2 * OUT_L, 0.16, 2 * OUT_W]} position={[0, 0.52, 0]} color={PALETTE.woodDeep} />
			{legs.map(([sx, sz]) => (
				<Block
					key={`${sx}:${sz}`}
					size={[0.16, 0.44, 0.16]}
					position={[sx * (HALF_L - 0.12), 0.22, sz * (HALF_W - 0.06)]}
					color={PALETTE.woodDeep}
				/>
			))}
			<Block
				size={[2 * (HALF_L + CUSHION), 0.04, 2 * (HALF_W + CUSHION)]}
				position={[0, POOL_SURFACE_Y - 0.02, 0]}
				color={FELT}
			/>
		</group>
	);
}

/** The house cue, laid on the cloth along the near rail between games; play hides it. */
export function RestingCue() {
	return (
		<group userData={DYNAMIC} position={[0.487, POOL_SURFACE_Y + 0.015, HALF_W - 0.1]}>
			<CueStick />
		</group>
	);
}

/**
 * A blocky eight-ball table, the long axis along local x (+x the rack end), on
 * the station scale like desks and people. At rest it shows a fresh rack.
 */
export function PoolTable() {
	return (
		<group scale={STATION_SCALE}>
			<Body />
			<Rails />
			<Cushions />
			<Pockets />
			<RestingCue />
			<PoolBalls balls={RESTING_RACK} />
		</group>
	);
}

const RESTING_RACK = restingRack();
