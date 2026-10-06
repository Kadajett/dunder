import type { Vector3Tuple } from "three";

const ORIGIN: Vector3Tuple = [0, 0, 0];

interface SurfaceProps {
	readonly color: string;
	readonly position?: Vector3Tuple;
	readonly rotation?: Vector3Tuple;
	/** Glow colour for LEDs, lamp shades and screens. */
	readonly emissive?: string;
	readonly emissiveIntensity?: number;
	readonly metalness?: number;
	readonly roughness?: number;
	readonly opacity?: number;
	/** Small details (LEDs, hands, paper) skip shadow casting. */
	readonly noShadow?: boolean;
}

function FlatMaterial(props: SurfaceProps) {
	const opacity = props.opacity ?? 1;
	return (
		<meshStandardMaterial
			color={props.color}
			flatShading
			emissive={props.emissive ?? "#000000"}
			emissiveIntensity={props.emissiveIntensity ?? 1}
			metalness={props.metalness ?? 0}
			roughness={props.roughness ?? 0.85}
			transparent={opacity < 1}
			opacity={opacity}
		/>
	);
}

interface BlockProps extends SurfaceProps {
	/** Full width, height, depth; `position` is the box centre. */
	readonly size: Vector3Tuple;
}

/** Flat-shaded box, the basic voxel-ish building block. */
export function Block(props: BlockProps) {
	const solid = !props.noShadow;
	return (
		<mesh
			position={props.position ?? ORIGIN}
			rotation={props.rotation ?? ORIGIN}
			castShadow={solid}
			receiveShadow={solid}
		>
			<boxGeometry args={props.size} />
			<FlatMaterial {...props} />
		</mesh>
	);
}

interface CylinderProps extends SurfaceProps {
	readonly radiusTop: number;
	readonly radiusBottom?: number;
	readonly height: number;
	readonly segments?: number;
}

/** Flat-shaded cylinder or cone frustum along local y; `position` is its centre. */
export function Cylinder(props: CylinderProps) {
	const solid = !props.noShadow;
	const radiusBottom = props.radiusBottom ?? props.radiusTop;
	return (
		<mesh
			position={props.position ?? ORIGIN}
			rotation={props.rotation ?? ORIGIN}
			castShadow={solid}
			receiveShadow={solid}
		>
			<cylinderGeometry
				args={[props.radiusTop, radiusBottom, props.height, props.segments ?? 10]}
			/>
			<FlatMaterial {...props} />
		</mesh>
	);
}

interface BallProps extends SurfaceProps {
	readonly radius: number;
	readonly scale?: Vector3Tuple;
	readonly segments?: number;
}

/** Low-poly sphere, optionally squashed via `scale`. */
export function Ball(props: BallProps) {
	const solid = !props.noShadow;
	const segments = props.segments ?? 10;
	return (
		<mesh
			position={props.position ?? ORIGIN}
			rotation={props.rotation ?? ORIGIN}
			scale={props.scale ?? [1, 1, 1]}
			castShadow={solid}
			receiveShadow={solid}
		>
			<sphereGeometry args={[props.radius, segments, Math.max(4, Math.round(segments * 0.75))]} />
			<FlatMaterial {...props} />
		</mesh>
	);
}
