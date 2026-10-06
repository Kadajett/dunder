import { STATION_SCALE } from "../scene/station";
import { PALETTE } from "./palette";
import { Block } from "./parts";

/** Tip blue, as on the house cue and the chalk. */
const TIP = "#3c6fb5";
const CUE_X = [-0.24, -0.08, 0.08, 0.24] as const;

/** One spare cue standing in the rack: dark butt below, pale shaft above, blue tip. */
function StandingCue({ x }: { readonly x: number }) {
	return (
		<group position={[x, 0, 0.075]}>
			<Block size={[0.03, 0.45, 0.03]} position={[0, -0.375, 0]} color={PALETTE.woodDeep} />
			<Block size={[0.018, 0.85, 0.018]} position={[0, 0.275, 0]} color={PALETTE.woodLight} />
			<Block size={[0.02, 0.014, 0.02]} position={[0, 0.706, 0]} color={TIP} noShadow />
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
