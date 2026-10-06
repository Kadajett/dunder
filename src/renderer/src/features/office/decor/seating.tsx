import { PALETTE } from "./palette";
import { Block, Cylinder } from "./parts";

const DEPTH = 0.9;
const ARM = 0.2;
const LEG = 0.07;
const BASE_TOP = 0.36;

function CouchLegs({ width }: { readonly width: number }) {
	const x = width / 2 - 0.08;
	const z = DEPTH / 2 - 0.08;
	const corners: readonly [number, number][] = [
		[-x, -z],
		[x, -z],
		[-x, z],
		[x, z],
	];
	return (
		<group>
			{corners.map(([cx, cz]) => (
				<Block
					key={`${cx}:${cz}`}
					size={[0.07, LEG, 0.07]}
					position={[cx, LEG / 2, cz]}
					color={PALETTE.woodDeep}
				/>
			))}
		</group>
	);
}

/** Chunky upholstered couch `width` wide with `seats` seat cushions, front toward +z. */
function Couch({ width, seats }: { readonly width: number; readonly seats: number }) {
	const inner = width - ARM * 2;
	const cushion = inner / seats;
	const baseHeight = BASE_TOP - LEG;
	const backDepth = 0.24;
	return (
		<group>
			<CouchLegs width={width} />
			<Block
				size={[width, baseHeight, DEPTH]}
				position={[0, LEG + baseHeight / 2, 0]}
				color={PALETTE.purpleDark}
			/>
			<Block
				size={[width, 0.5, backDepth]}
				position={[0, BASE_TOP + 0.25, -DEPTH / 2 + backDepth / 2]}
				color={PALETTE.purpleDark}
			/>
			{[-1, 1].map((side) => (
				<Block
					key={side}
					size={[ARM, 0.3, DEPTH]}
					position={[side * (width / 2 - ARM / 2), BASE_TOP + 0.15, 0]}
					color={PALETTE.purple}
				/>
			))}
			{Array.from({ length: seats }, (_, i) => {
				const x = -inner / 2 + cushion * (i + 0.5);
				return (
					<group key={x}>
						<Block
							size={[cushion - 0.03, 0.14, DEPTH - backDepth - 0.04]}
							position={[x, BASE_TOP + 0.07, backDepth / 2 + 0.01]}
							color={PALETTE.purpleLight}
						/>
						<Block
							size={[cushion - 0.05, 0.36, 0.12]}
							position={[x, BASE_TOP + 0.3, -DEPTH / 2 + backDepth + 0.06]}
							rotation={[-0.12, 0, 0]}
							color={PALETTE.purple}
						/>
					</group>
				);
			})}
		</group>
	);
}

/** Purple break-room sofa, 2.0 × 0.9. */
export function Sofa() {
	return <Couch width={2} seats={2} />;
}

/** Single purple armchair, 1.0 × 0.9. */
export function Armchair() {
	return <Couch width={1} seats={1} />;
}

function Mug() {
	return (
		<group position={[-0.24, 0.42, 0.06]}>
			<Cylinder
				radiusTop={0.045}
				height={0.1}
				segments={10}
				position={[0, 0.05, 0]}
				color={PALETTE.paper}
			/>
			<Block
				size={[0.03, 0.06, 0.015]}
				position={[0.055, 0.05, 0]}
				color={PALETTE.paper}
				noShadow
			/>
			<Cylinder
				radiusTop={0.038}
				height={0.005}
				position={[0, 0.098, 0]}
				color={PALETTE.woodDeep}
				noShadow
			/>
		</group>
	);
}

/** Low wooden table with a mug and a book. */
export function CoffeeTable() {
	const top = 0.4;
	const legX = 0.42;
	const legZ = 0.22;
	return (
		<group>
			<Block size={[1, 0.06, 0.6]} position={[0, top - 0.03, 0]} color={PALETTE.woodLight} />
			<Block size={[0.9, 0.03, 0.5]} position={[0, 0.12, 0]} color={PALETTE.woodDark} />
			{[-legX, legX].flatMap((x) =>
				[-legZ, legZ].map((z) => (
					<Block
						key={`${x}:${z}`}
						size={[0.06, top - 0.06, 0.06]}
						position={[x, (top - 0.06) / 2, z]}
						color={PALETTE.woodDark}
					/>
				)),
			)}
			<Mug />
			<Block
				size={[0.28, 0.05, 0.2]}
				position={[0.18, top + 0.025, -0.02]}
				rotation={[0, 0.25, 0]}
				color="#a8463c"
			/>
		</group>
	);
}
