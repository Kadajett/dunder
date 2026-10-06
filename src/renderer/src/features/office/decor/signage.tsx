import { Text } from "@react-three/drei";
import { FONTS } from "../fonts";
import { PALETTE } from "./palette";
import { Block } from "./parts";
import type { DecorProps } from "./props";

const DESK_W = 2.6;
const DESK_D = 0.9;
const DESK_H = 1.04;
const LEDGE = 0.06;
const TOP = 0.14;

/**
 * Reception counter 2.6 × 0.9: a wood body, a pale ledge and a raised green top slab.
 * `label` is printed straight onto the +z face.
 */
export function ReceptionDesk({ label = "RECEPTION" }: DecorProps) {
	const bodyH = DESK_H - LEDGE - TOP;
	const bodyD = DESK_D - 0.12;
	return (
		<group>
			<Block
				size={[DESK_W - 0.14, bodyH, bodyD]}
				position={[0, bodyH / 2, 0]}
				color={PALETTE.receptionWood}
			/>
			<Block
				size={[DESK_W, LEDGE, DESK_D]}
				position={[0, bodyH + LEDGE / 2, 0]}
				color={PALETTE.receptionLedge}
			/>
			<Block
				size={[DESK_W - 0.24, TOP, DESK_D - 0.3]}
				position={[0, bodyH + LEDGE + TOP / 2, -0.08]}
				color={PALETTE.receptionGreen}
			/>
			<Text
				font={FONTS.display}
				fontSize={0.15}
				letterSpacing={0.32}
				color={PALETTE.paper}
				anchorX="center"
				anchorY="middle"
				maxWidth={DESK_W - 0.4}
				position={[0, bodyH - 0.2, bodyD / 2 + 0.005]}
			>
				{label}
			</Text>
		</group>
	);
}

const POSTINGS = [
	{ width: 0.66, color: PALETTE.postingGreen },
	{ width: 0.66, color: PALETTE.postingBlue },
	{ width: 0.46, color: PALETTE.postingGray },
] as const;

/** Freestanding board on a post; `label` is the title above coloured postings. */
export function NoticeBoard({ label = "OPEN ROLES" }: DecorProps) {
	const post = 1.0;
	const boardY = post + 0.3;
	return (
		<group>
			<Block size={[0.5, 0.05, 0.08]} position={[0, 0.025, 0]} color={PALETTE.woodDeep} />
			<Block size={[0.08, 0.05, 0.4]} position={[0, 0.025, 0]} color={PALETTE.woodDeep} />
			<Block size={[0.08, post, 0.08]} position={[0, post / 2, 0]} color={PALETTE.woodDeep} />
			<group position={[0, boardY, 0]}>
				<Block size={[0.9, 0.64, 0.05]} color={PALETTE.boardBorder} />
				<Block size={[0.84, 0.58, 0.01]} position={[0, 0, 0.03]} color={PALETTE.paper} />
				<Text
					font={FONTS.monoBold}
					fontSize={0.075}
					letterSpacing={0.12}
					color={PALETTE.charcoal}
					anchorX="center"
					anchorY="middle"
					maxWidth={0.8}
					position={[0, 0.19, 0.037]}
				>
					{label}
				</Text>
				{POSTINGS.map((p, row) => (
					<Block
						key={p.color}
						size={[p.width, 0.06, 0.008]}
						position={[-0.33 + p.width / 2, 0.06 - row * 0.11, 0.039]}
						color={p.color}
						noShadow
					/>
				))}
			</group>
		</group>
	);
}
