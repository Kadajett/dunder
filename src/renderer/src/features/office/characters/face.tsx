import type { BrowStyle, EyeStyle, MouthStyle } from "@shared/avatar/style";
import { GEO } from "./geometry";
import { Part } from "./Part";

const INK = "#2b211c";
const EYE_WHITE = "#fbf7f0";
const LIP = "#6e2f2c";

/* Feature anchors on the (unsquashed) head sphere; rotations follow the surface. */
const EYE_X = 0.075;
const EYE_Y = 0.015;
const EYE_Z = 0.214;
const EYE_YAW = Math.atan2(EYE_X, EYE_Z);

const EYE_SCALE: Record<EyeStyle, [number, number, number]> = {
	dot: [1, 1.1, 0.6],
	oval: [0.85, 1.6, 0.6],
	sleepy: [1.3, 0.45, 0.6],
	wide: [1.3, 1.45, 0.6],
};

function Eyes({ style }: { style: EyeStyle }) {
	return (
		<>
			{([1, -1] as const).map((side) => (
				<group
					key={side}
					position={[side * EYE_X, style === "sleepy" ? EYE_Y - 0.008 : EYE_Y, EYE_Z]}
					rotation={[0, side * EYE_YAW, 0]}
				>
					<Part
						geometry={GEO.eye}
						color={style === "wide" ? EYE_WHITE : INK}
						scale={EYE_SCALE[style]}
					/>
					{style === "wide" ? (
						<Part geometry={GEO.pupil} color={INK} position={[0, -0.004, 0.012]} />
					) : null}
				</group>
			))}
		</>
	);
}

/** Brow roll (positive raises the outer end) and lift per style. */
const BROWS: Record<BrowStyle, { roll: number; lift: number; thickness: number }> = {
	flat: { roll: 0, lift: 0, thickness: 1 },
	raised: { roll: -0.22, lift: 0.014, thickness: 1 },
	angled: { roll: 0.3, lift: 0, thickness: 1.1 },
	thick: { roll: 0.05, lift: 0, thickness: 1.9 },
};

function Brows({ style, color }: { style: BrowStyle; color: string }) {
	const brow = BROWS[style];
	return (
		<>
			{([1, -1] as const).map((side) => (
				<Part
					key={side}
					geometry={GEO.brow}
					color={color}
					position={[side * 0.082, 0.078 + brow.lift, 0.203]}
					rotation={[-0.36, side * 0.39, side * brow.roll]}
					scale={[1, brow.thickness, 1]}
				/>
			))}
		</>
	);
}

function Mouth({ style }: { style: MouthStyle }) {
	return (
		<group position={[0, -0.085, 0.212]} rotation={[0.37, 0, 0]}>
			{style === "smile" ? (
				<Part
					geometry={GEO.smile}
					color={LIP}
					position={[0, 0.012, 0]}
					rotation={[0, 0, Math.PI]}
					scale={[1, 0.6, 1]}
				/>
			) : null}
			{style === "smirk" ? (
				<Part
					geometry={GEO.smile}
					color={LIP}
					position={[0.015, 0.008, 0]}
					rotation={[0, 0, Math.PI + 0.3]}
					scale={[0.7, 0.45, 1]}
				/>
			) : null}
			{style === "grin" ? (
				<>
					<Part geometry={GEO.grin} color={LIP} rotation={[Math.PI / 2, 0, 0]} />
					<Part
						geometry={GEO.panel}
						color={EYE_WHITE}
						position={[0, -0.007, 0.004]}
						scale={[0.07, 0.013, 0.01]}
					/>
				</>
			) : null}
			{style === "flat" ? <Part geometry={GEO.flatMouth} color={LIP} /> : null}
			{style === "open" ? (
				<Part geometry={GEO.openMouth} color={LIP} scale={[1, 0.75, 0.45]} />
			) : null}
		</group>
	);
}

interface FaceProps {
	skin: string;
	browColor: string;
	eyes: EyeStyle;
	brows: BrowStyle;
	mouth: MouthStyle;
}

/** Head sphere, ears and face, in skull space (centre of the head). */
export function Face({ skin, browColor, eyes, brows, mouth }: FaceProps) {
	return (
		<>
			<Part geometry={GEO.head} color={skin} />
			{([1, -1] as const).map((side) => (
				<Part
					key={side}
					geometry={GEO.ear}
					color={skin}
					position={[side * 0.226, -0.005, -0.01]}
					scale={[0.45, 1, 0.75]}
				/>
			))}
			<Part geometry={GEO.nose} color={skin} position={[0, -0.025, 0.226]} scale={[1, 0.8, 0.8]} />
			<Eyes style={eyes} />
			<Brows style={brows} color={browColor} />
			<Mouth style={mouth} />
		</>
	);
}
