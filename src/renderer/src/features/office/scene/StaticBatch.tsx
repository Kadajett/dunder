import { type ReactNode, useLayoutEffect, useRef } from "react";
import {
	type BufferGeometry,
	type Group,
	Matrix4,
	Mesh,
	type MeshStandardMaterial,
	type Object3D,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * `userData` for an object whose transform or material changes after mount
 * (hover colours, swapped textures, animated groups): it and everything below
 * it stay individual meshes instead of being merged into the static batch.
 */
export const DYNAMIC = { dynamic: true } as const;

export interface StaticBatchProps {
	readonly children: ReactNode;
	/**
	 * Re-merge when any of these change (the layout, typically). Children that mount
	 * later (hover rings) simply render on their own.
	 */
	readonly deps: readonly unknown[];
	/** False renders the children as they are, e.g. while the layout is being edited. */
	readonly enabled?: boolean;
}

interface Bucket {
	readonly material: MeshStandardMaterial;
	readonly castShadow: boolean;
	readonly receiveShadow: boolean;
	readonly geometries: BufferGeometry[];
	readonly sources: Mesh[];
}

/** Meshes render identically when these agree, so one merged mesh can stand in for all of them. */
function bucketKey(mesh: Mesh, material: MeshStandardMaterial): string {
	return [
		material.color.getHex(),
		material.emissive.getHex(),
		material.emissiveIntensity,
		material.roughness,
		material.metalness,
		material.flatShading,
		material.side,
		material.transparent,
		material.opacity,
		material.map?.uuid ?? "",
		mesh.castShadow,
		mesh.receiveShadow,
	].join("|");
}

/** Plain standard-material meshes only: text, instanced and basic-material meshes stay as they are. */
function batchable(object: Object3D): object is Mesh<BufferGeometry, MeshStandardMaterial> {
	if (!(object instanceof Mesh) || "isInstancedMesh" in object) return false;
	const material: unknown = object.material;
	return (
		typeof material === "object" &&
		material !== null &&
		"isMeshStandardMaterial" in material &&
		!("isDerivedMaterial" in material)
	);
}

function collect(object: Object3D, toLocal: Matrix4, buckets: Map<string, Bucket>): void {
	if (object.userData["dynamic"] === true) return;
	if (batchable(object)) {
		const key = bucketKey(object, object.material);
		let bucket = buckets.get(key);
		if (!bucket) {
			bucket = {
				material: object.material,
				castShadow: object.castShadow,
				receiveShadow: object.receiveShadow,
				geometries: [],
				sources: [],
			};
			buckets.set(key, bucket);
		}
		const geometry = object.geometry.clone();
		geometry.applyMatrix4(new Matrix4().multiplyMatrices(toLocal, object.matrixWorld));
		bucket.geometries.push(geometry);
		bucket.sources.push(object);
	}
	for (const child of object.children) collect(child, toLocal, buckets);
}

/**
 * Merges every batchable mesh under `source` into one mesh per bucket under `target`
 * (positioned in `target`'s space), hiding the originals. Returns the undo.
 */
export function bakeStaticBatch(source: Group, target: Group): () => void {
	source.updateMatrixWorld(true);
	target.updateMatrixWorld(true);
	const toLocal = target.matrixWorld.clone().invert();
	const buckets = new Map<string, Bucket>();
	collect(source, toLocal, buckets);
	const merged: Mesh<BufferGeometry, MeshStandardMaterial>[] = [];
	const hidden: Mesh[] = [];
	for (const bucket of buckets.values()) {
		const geometry = mergeGeometries(bucket.geometries, false);
		for (const part of bucket.geometries) part.dispose();
		if (!geometry) continue;
		const mesh = new Mesh(geometry, bucket.material.clone());
		mesh.castShadow = bucket.castShadow;
		mesh.receiveShadow = bucket.receiveShadow;
		target.add(mesh);
		merged.push(mesh);
		for (const original of bucket.sources) {
			original.visible = false;
			hidden.push(original);
		}
	}
	return () => {
		for (const original of hidden) original.visible = true;
		for (const mesh of merged) {
			target.remove(mesh);
			mesh.geometry.dispose();
			mesh.material.dispose();
		}
	};
}

/**
 * Draws its static children as a handful of merged meshes (one per material and
 * shadow setting) instead of hundreds of small ones, which is what the renderer's
 * per-object cost scales with. The originals stay in the scene, hidden, so
 * raycasting and pointer events keep working; mark anything that changes after
 * mount with `userData={DYNAMIC}`.
 */
export function StaticBatch({ children, deps, enabled = true }: StaticBatchProps) {
	const source = useRef<Group>(null);
	const target = useRef<Group>(null);
	useLayoutEffect(() => {
		if (!enabled || !source.current || !target.current) return;
		return bakeStaticBatch(source.current, target.current);
	}, [enabled, ...deps]);
	return (
		<>
			<group ref={source}>{children}</group>
			<group ref={target} />
		</>
	);
}
