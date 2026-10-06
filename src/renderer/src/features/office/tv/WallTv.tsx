import { PALETTE } from "../decor/palette";
import { Block } from "../decor/parts";
import { Clickable } from "../interaction/Clickable";
import { useTvChannel } from "./useTvChannel";
import { useTvInputs } from "./useTvInputs";
import { useTvTexture } from "./useTvTexture";

/** Visible picture area (16:9), the bezel around it and the set's depth off the wall. */
const SCREEN_W = 2.4;
const SCREEN_H = 1.35;
const BEZEL = 0.07;
const DEPTH = 0.08;

/**
 * Wall-mounted flat TV: centred on the origin, back plane at z = 0, facing +z.
 * Click to flip to the next channel; the channel survives restarts.
 */
export function WallTv() {
	const { channel, switchedAt, next } = useTvChannel();
	const texture = useTvTexture(channel, useTvInputs(), switchedAt);
	return (
		<group>
			<Clickable onSelect={next}>
				<Block
					size={[SCREEN_W + BEZEL * 2, SCREEN_H + BEZEL * 2, DEPTH]}
					position={[0, 0, DEPTH / 2]}
					color="#17191d"
					roughness={0.45}
				/>
				<mesh position={[0, 0, DEPTH + 0.002]}>
					<planeGeometry args={[SCREEN_W, SCREEN_H]} />
					<meshBasicMaterial map={texture} toneMapped={false} />
				</mesh>
			</Clickable>
			<Block
				size={[0.05, 0.018, 0.01]}
				position={[SCREEN_W / 2 - 0.05, -SCREEN_H / 2 - BEZEL / 2, DEPTH + 0.004]}
				color={PALETTE.ledGreen}
				emissive={PALETTE.ledGreen}
				emissiveIntensity={1.2}
				noShadow
			/>
			<Block
				size={[1.5, 0.1, 0.14]}
				position={[0, -SCREEN_H / 2 - BEZEL - 0.16, 0.07]}
				color={PALETTE.charcoal}
				roughness={0.6}
			/>
		</group>
	);
}
