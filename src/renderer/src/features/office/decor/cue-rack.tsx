import { STATION_SCALE } from "../scene/station";
import { CueStick } from "./cue-stick";
import { PALETTE } from "./palette";
import { Block } from "./parts";

const CUE_X = [-0.24, -0.08, 0.08, 0.24] as const;
/** Butts rest in the tray at the bottom; tips stand just above the board. */
const BUTT_Y = -0.6;
const TIP_Y = 0.714;

/** One spare cue standing in the rack, tip up. */
function StandingCue({ x }: { readonly x: number }) {
	return (
		<group position={[x, TIP_Y, 0.075]} rotation={[0, 0, Math.PI / 2]}>
			<CueStick length={TIP_Y - BUTT_Y} />
		</group>
	);
}

/**
 * A wall rack of spare cues, on the station scale like the table. Wall kind:
 * the back plane at z = 0, centred on its mounting height, front toward +z.
 */
export function CueRack() {
	return (
		<group scale={STATION_SCALE}>
			<Block size={[0.7, 1.2, 0.03]} position={[0, 0, 0.015]} color={PALETTE.woodDark} />
			{/* A tray holding the butts and a clip bar for the shafts. */}
			<Block size={[0.72, 0.04, 0.1]} position={[0, -0.52, 0.06]} color={PALETTE.woodDeep} />
			<Block size={[0.72, 0.035, 0.05]} position={[0, 0.4, 0.055]} color={PALETTE.woodDeep} />
			{CUE_X.map((x) => (
				<StandingCue key={x} x={x} />
			))}
		</group>
	);
}
