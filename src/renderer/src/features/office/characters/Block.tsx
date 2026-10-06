import { BoxGeometry, MeshStandardMaterial } from "three";

/** Mutable so it can feed three.js tuple props directly. */
export type Vec3 = [number, number, number];

/** One box of a voxel character: centre, size (metres) and optional Euler rotation. */
export interface Cuboid {
	readonly color: string;
	readonly at: Vec3;
	readonly size: Vec3;
	readonly rotation?: Vec3;
}

/** Every block scales this one unit cube, so a crowd shares a single GPU buffer. */
const UNIT_BOX = new BoxGeometry(1, 1, 1);
const materials = new Map<string, MeshStandardMaterial>();

/** Flat-shaded materials shared by colour, so a crowd reuses a handful. */
function materialFor(color: string): MeshStandardMaterial {
	let material = materials.get(color);
	if (material === undefined) {
		material = new MeshStandardMaterial({ color, flatShading: true, roughness: 0.85 });
		materials.set(color, material);
	}
	return material;
}

/** `size` mirrored to both sides of the body: the +x block first, then its -x twin. */
export function mirrored(
	color: string,
	[x, y, z]: Vec3,
	size: Vec3,
	rotation?: Vec3,
): [Cuboid, Cuboid] {
	const flip: Vec3 | undefined = rotation && [rotation[0], -rotation[1], -rotation[2]];
	return [
		{ color, at: [x, y, z], size, ...(rotation && { rotation }) },
		{ color, at: [-x, y, z], size, ...(flip && { rotation: flip }) },
	];
}

/** One shadow-casting, flat-shaded box. */
export function Block({ color, at, size, rotation }: Cuboid) {
	return (
		<mesh
			castShadow
			geometry={UNIT_BOX}
			material={materialFor(color)}
			position={at}
			scale={size}
			{...(rotation && { rotation })}
		/>
	);
}

/** A static list of blocks in the parent's space. */
export function Blocks({ items }: { readonly items: readonly Cuboid[] }) {
	return (
		<>
			{items.map((item) => (
				<Block key={`${item.color}${item.at.join()}${item.size.join()}`} {...item} />
			))}
		</>
	);
}
