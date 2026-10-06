import type { Group } from "three";
import { usePokeReaction } from "../interaction/Poke";
import { DYNAMIC } from "../scene/StaticBatch";
import { PALETTE } from "./palette";
import { Ball, Block } from "./parts";

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
	/** Side of the square planter. */
	readonly side: number;
	readonly height: number;
}

/**
 * A broad, pointed blade hinged at its base, leaning outward along `yaw`. The blade lies in
 * the plane of its lean, so leaves splayed across the view show their full width.
 */
function Leaf({ leaf }: { readonly leaf: LeafSpec }) {
	const half = leaf.length / 2;
	return (
		<group rotation={[0, leaf.yaw, 0]}>
			<group rotation={[leaf.tilt, 0, 0]}>
				<Ball
					radius={1}
					segments={6}
					position={[0, half, 0]}
					scale={[0.04, half, leaf.width / 2]}
					color={leaf.color}
				/>
			</group>
		</group>
	);
}

/** Square wooden planter with a darker rim and soil, as in the reference. */
function Planter({ pot }: { readonly pot: PotSpec }) {
	const rim = 0.05;
	const body = pot.height - rim;
	return (
		<group>
			<Block
				size={[pot.side * 0.9, body, pot.side * 0.9]}
				position={[0, body / 2, 0]}
				color={PALETTE.planter}
			/>
			<Block
				size={[pot.side, rim, pot.side]}
				position={[0, body + rim / 2, 0]}
				color={PALETTE.planterDark}
			/>
			<Block
				size={[pot.side * 0.82, 0.012, pot.side * 0.82]}
				position={[0, pot.height + 0.006, 0]}
				color={PALETTE.soil}
				noShadow
			/>
		</group>
	);
}

/** Poked leaves rustle: they sway from the soil, mostly across the view. */
function rustle(leaves: Group, strength: number): void {
	leaves.rotation.set(0.12 * strength, 0, 0.3 * strength);
}

function PottedPlant(props: { readonly pot: PotSpec; readonly leaves: readonly LeafSpec[] }) {
	const leaves = usePokeReaction(rustle);
	return (
		<group>
			<Planter pot={props.pot} />
			<group ref={leaves} position={[0, props.pot.height, 0]} userData={DYNAMIC}>
				{props.leaves.map((leaf) => (
					<Leaf key={`${leaf.yaw}:${leaf.tilt}`} leaf={leaf} />
				))}
			</group>
		</group>
	);
}

/**
 * Two big leaves splayed into a V across the view (screen-horizontal is world x − z for the
 * isometric camera), with smaller ones filling the gap front and back.
 */
function vLeaves(length: number, width: number): LeafSpec[] {
	return [
		{ yaw: -Math.PI / 4, tilt: 0.42, length, width, color: PALETTE.sage },
		{ yaw: (Math.PI * 3) / 4, tilt: 0.36, length: length * 0.94, width, color: PALETTE.sageLight },
		{
			yaw: Math.PI / 4,
			tilt: 0.16,
			length: length * 0.7,
			width: width * 0.6,
			color: PALETTE.sageMid,
		},
		{
			yaw: (Math.PI * 5) / 4,
			tilt: 0.2,
			length: length * 0.6,
			width: width * 0.55,
			color: PALETTE.sage,
		},
	];
}

// Sized against the reference, where potted plants stand about as tall as a seated agent.
const SMALL_POT: PotSpec = { side: 0.46, height: 0.42 };
const SMALL_LEAVES = vLeaves(1.08, 0.5);

const TALL_POT: PotSpec = { side: 0.6, height: 0.54 };
const TALL_LEAVES = vLeaves(1.62, 0.64);

/** Potted plant ≈ 1.5 tall: a square planter and broad low-poly leaves. */
export function Plant() {
	return <PottedPlant pot={SMALL_POT} leaves={SMALL_LEAVES} />;
}

/** Floor plant ≈ 2.2 tall in a larger planter. */
export function TallPlant() {
	return <PottedPlant pot={TALL_POT} leaves={TALL_LEAVES} />;
}
