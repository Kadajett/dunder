import { Text } from "@react-three/drei";
import { FONTS } from "../fonts";
import { PALETTE } from "./palette";
import { Ball, Block, Cylinder } from "./parts";
import type { DecorProps } from "./props";

const DESK_W = 2.6;
const DESK_D = 0.9;
const DESK_H = 1.04;

function TapBell() {
	return (
		<group position={[0.85, DESK_H + 0.04, 0.12]}>
			<Cylinder
				radiusTop={0.07}
				height={0.02}
				segments={10}
				position={[0, 0.01, 0]}
				color={PALETTE.charcoal}
			/>
			<Ball
				radius={0.06}
				segments={10}
				scale={[1, 0.7, 1]}
				position={[0, 0.03, 0]}
				color={PALETTE.brass}
				metalness={0.55}
				roughness={0.35}
			/>
		</group>
	);
}

/** Reception counter 2.6 × 0.9 with a green top; `label` is printed on the +z face. */
export function ReceptionDesk({ label = "RECEPTION" }: DecorProps) {
	const bodyD = DESK_D - 0.1;
	const front = bodyD / 2;
	return (
		<group>
			<Block
				size={[DESK_W - 0.16, 0.08, bodyD - 0.06]}
				position={[0, 0.04, 0]}
				color={PALETTE.woodDeep}
			/>
			<Block
				size={[DESK_W - 0.1, DESK_H - 0.12, bodyD]}
				position={[0, 0.08 + (DESK_H - 0.12) / 2, 0]}
				color={PALETTE.woodDark}
			/>
			<Block
				size={[DESK_W - 0.3, 0.5, 0.02]}
				position={[0, 0.58, front + 0.01]}
				color={PALETTE.woodLight}
			/>
			<Text
				font={FONTS.display}
				fontSize={0.16}
				letterSpacing={0.3}
				color={PALETTE.cream}
				anchorX="center"
				anchorY="middle"
				maxWidth={DESK_W - 0.4}
				position={[0, 0.58, front + 0.025]}
			>
				{label}
			</Text>
			<Block size={[DESK_W, 0.08, DESK_D]} position={[0, DESK_H, 0]} color={PALETTE.deskGreen} />
			<Block
				size={[0.34, 0.05, 0.26]}
				position={[-0.7, DESK_H + 0.065, -0.05]}
				rotation={[0, -0.15, 0]}
				color={PALETTE.paper}
			/>
			<TapBell />
		</group>
	);
}

const POSTINGS = [
	{ width: 0.62, color: PALETTE.deskGreen },
	{ width: 0.62, color: "#3f6e8c" },
	{ width: 0.44, color: "#b9b4aa" },
] as const;

/** Freestanding board on a post; `label` is the title above coloured postings. */
export function NoticeBoard({ label = "OPEN ROLES" }: DecorProps) {
	const post = 1.0;
	const boardY = post + 0.3;
	return (
		<group>
			<Block size={[0.5, 0.05, 0.08]} position={[0, 0.025, 0]} color={PALETTE.woodDeep} />
			<Block size={[0.08, 0.05, 0.4]} position={[0, 0.025, 0]} color={PALETTE.woodDeep} />
			<Block size={[0.08, post, 0.08]} position={[0, post / 2, 0]} color={PALETTE.woodDark} />
			<group position={[0, boardY, 0]}>
				<Block size={[0.9, 0.64, 0.05]} color={PALETTE.woodDark} />
				<Block size={[0.82, 0.56, 0.01]} position={[0, 0, 0.03]} color={PALETTE.paper} />
				<Text
					font={FONTS.monoBold}
					fontSize={0.075}
					letterSpacing={0.12}
					color={PALETTE.charcoal}
					anchorX="center"
					anchorY="middle"
					maxWidth={0.78}
					position={[0, 0.19, 0.037]}
				>
					{label}
				</Text>
				{POSTINGS.map((p, row) => (
					<Block
						key={p.color}
						size={[p.width, 0.05, 0.008]}
						position={[-0.31 + p.width / 2, 0.06 - row * 0.1, 0.039]}
						color={p.color}
						noShadow
					/>
				))}
			</group>
		</group>
	);
}
