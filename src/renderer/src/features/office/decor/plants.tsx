import { PALETTE } from "./palette";
import { Ball, Cylinder } from "./parts";

interface LeafSpec {
	/** Heading around the stem, radians. */
	readonly yaw: number;
	/** Lean away from vertical, radians. */
	readonly tilt: number;
	readonly length: number;
	readonly width: number;
	readonly color: string;
}

interface PotSpec {
	readonly radius: number;
	readonly height: number;
}

/** A broad, pointed leaf hinged at its base; leans outward along `yaw`. */
function Leaf({ leaf }: { readonly leaf: LeafSpec }) {
	const half = leaf.length / 2;
	return (
		<group rotation={[0, leaf.yaw, 0]}>
			<group rotation={[leaf.tilt, 0, 0]}>
				<Ball
					radius={1}
					segments={6}
					position={[0, half, 0]}
					scale={[leaf.width / 2, half, 0.035]}
					color={leaf.color}
				/>
			</group>
		</group>
	);
}

function Pot({ pot }: { readonly pot: PotSpec }) {
	const rimHeight = 0.06;
	return (
		<group>
			<Cylinder
				radiusTop={pot.radius * 0.95}
				radiusBottom={pot.radius * 0.72}
				height={pot.height}
				segments={8}
				position={[0, pot.height / 2, 0]}
				color={PALETTE.terracotta}
			/>
			<Cylinder
				radiusTop={pot.radius * 1.05}
				height={rimHeight}
				segments={8}
				position={[0, pot.height - rimHeight / 2, 0]}
				color={PALETTE.terracottaDark}
			/>
			<Cylinder
				radiusTop={pot.radius * 0.9}
				height={0.02}
				segments={8}
				position={[0, pot.height - 0.015, 0]}
				color={PALETTE.soil}
				noShadow
			/>
		</group>
	);
}

function PottedPlant(props: { readonly pot: PotSpec; readonly leaves: readonly LeafSpec[] }) {
	const top = props.pot.height - 0.02;
	return (
		<group>
			<Pot pot={props.pot} />
			<group position={[0, top, 0]}>
				{props.leaves.map((leaf) => (
					<Leaf key={`${leaf.yaw}:${leaf.tilt}`} leaf={leaf} />
				))}
			</group>
		</group>
	);
}

const TAU = Math.PI * 2;

function leafRing(count: number, base: Omit<LeafSpec, "yaw" | "color">): LeafSpec[] {
	const colors = [PALETTE.leaf, PALETTE.leafDark, PALETTE.leafPale];
	return Array.from({ length: count }, (_, i) => ({
		...base,
		yaw: (i / count) * TAU + 0.4,
		tilt: base.tilt * (i % 2 === 0 ? 1 : 0.7),
		length: base.length * (i % 2 === 0 ? 1 : 0.85),
		color: colors[i % colors.length] ?? PALETTE.leaf,
	}));
}

const SMALL_POT: PotSpec = { radius: 0.2, height: 0.34 };
const SMALL_LEAVES: readonly LeafSpec[] = [
	{ yaw: 0, tilt: 0.08, length: 0.66, width: 0.3, color: PALETTE.leaf },
	...leafRing(5, { tilt: 0.5, length: 0.52, width: 0.28 }),
];

const TALL_POT: PotSpec = { radius: 0.27, height: 0.46 };
const TALL_LEAVES: readonly LeafSpec[] = [
	{ yaw: 0.3, tilt: 0.06, length: 1.12, width: 0.38, color: PALETTE.leafDark },
	{ yaw: 2.4, tilt: 0.14, length: 1.0, width: 0.36, color: PALETTE.leaf },
	...leafRing(6, { tilt: 0.48, length: 0.85, width: 0.36 }),
];

/** Potted plant ≈ 1.0 tall with broad low-poly leaves. */
export function Plant() {
	return <PottedPlant pot={SMALL_POT} leaves={SMALL_LEAVES} />;
}

/** Floor plant ≈ 1.6 tall in a larger terracotta pot. */
export function TallPlant() {
	return <PottedPlant pot={TALL_POT} leaves={TALL_LEAVES} />;
}
