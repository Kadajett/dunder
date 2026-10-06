import { PALETTE } from "./palette";
import { Block } from "./parts";

/** Tip blue, shared with the cues in the wall rack. */
export const CUE_TIP = "#3c6fb5";

const TIP_LENGTH = 0.012;
const BUTT_LENGTH = 0.55;
/** A house cue, about 1.45 m like a real one (metres, before the station scale). */
const DEFAULT_LENGTH = 1.45;

/**
 * A cue with its tip at the origin, pointing along +x, its axis on y = 0: a
 * dark butt, a pale shaft and a blue tip. For the stroke on the table and the
 * one a player holds; `length` stretches the shaft.
 */
export function CueStick({ length = DEFAULT_LENGTH }: { readonly length?: number }) {
	const shaft = length - BUTT_LENGTH - TIP_LENGTH;
	return (
		<group>
			<Block
				size={[TIP_LENGTH, 0.018, 0.018]}
				position={[-TIP_LENGTH / 2, 0, 0]}
				color={CUE_TIP}
				noShadow
			/>
			<Block
				size={[shaft, 0.02, 0.02]}
				position={[-TIP_LENGTH - shaft / 2, 0, 0]}
				color={PALETTE.woodLight}
			/>
			<Block
				size={[BUTT_LENGTH, 0.03, 0.03]}
				position={[-length + BUTT_LENGTH / 2, 0, 0]}
				color={PALETTE.woodDeep}
			/>
		</group>
	);
}
