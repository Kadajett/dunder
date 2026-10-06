import type { ThreeElements } from "@react-three/fiber";
import { DoubleSide, FrontSide, MeshStandardMaterial } from "three";

const materials = new Map<string, MeshStandardMaterial>();

/** Flat-shaded materials shared by colour, so a crowd of Miis reuses a handful. */
function materialFor(color: string, doubleSided: boolean): MeshStandardMaterial {
	const key = `${color}|${doubleSided ? 2 : 1}`;
	let material = materials.get(key);
	if (material === undefined) {
		material = new MeshStandardMaterial({
			color,
			flatShading: true,
			roughness: 0.85,
			side: doubleSided ? DoubleSide : FrontSide,
		});
		materials.set(key, material);
	}
	return material;
}

type PartProps = Omit<ThreeElements["mesh"], "material" | "args"> & {
	color: string;
	/** Open shells (hair, hats) need both faces so their inside never vanishes. */
	doubleSided?: boolean;
};

/** One shadow-casting, flat-shaded mesh of a Mii character. */
export function Part({ color, doubleSided = false, ...mesh }: PartProps) {
	return <mesh castShadow material={materialFor(color, doubleSided)} {...mesh} />;
}
