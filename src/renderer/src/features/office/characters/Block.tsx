import { useEffect, useMemo } from "react";
import {
	BoxGeometry,
	type BufferGeometry,
	Euler,
	Matrix4,
	MeshStandardMaterial,
	Quaternion,
	Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

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

interface ColorGeometry {
	readonly color: string;
	readonly geometry: BufferGeometry;
}

function cuboidGeometry({ at, size, rotation }: Cuboid): BufferGeometry {
	const transform = new Matrix4().compose(
		new Vector3(...at),
		new Quaternion().setFromEuler(new Euler(...(rotation ?? [0, 0, 0]))),
		new Vector3(...size),
	);
	return UNIT_BOX.clone().applyMatrix4(transform);
}

/** All blocks of one colour as a single geometry: a head is a few draw calls, not dozens. */
export function mergeBlocks(items: readonly Cuboid[]): ColorGeometry[] {
	const byColor = new Map<string, BufferGeometry[]>();
	for (const item of items) {
		const parts = byColor.get(item.color) ?? [];
		parts.push(cuboidGeometry(item));
		byColor.set(item.color, parts);
	}
	const merged: ColorGeometry[] = [];
	for (const [color, parts] of byColor) {
		const geometry = mergeGeometries(parts, false);
		for (const part of parts) part.dispose();
		if (geometry) merged.push({ color, geometry });
	}
	return merged;
}

/**
 * A static list of blocks in the parent's space, drawn as one mesh per colour.
 * Flat decals pass `castShadow={false}` to stay out of the shadow pass.
 */
export function Blocks({
	items,
	castShadow = true,
}: {
	readonly items: readonly Cuboid[];
	readonly castShadow?: boolean;
}) {
	const merged = useMemo(() => mergeBlocks(items), [items]);
	useEffect(
		() => () => {
			for (const { geometry } of merged) geometry.dispose();
		},
		[merged],
	);
	return (
		<>
			{merged.map(({ color, geometry }) => (
				<mesh
					key={color}
					castShadow={castShadow}
					geometry={geometry}
					material={materialFor(color)}
				/>
			))}
		</>
	);
}
