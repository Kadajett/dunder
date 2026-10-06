import type { Zone } from "@shared/layout/schema";
import { Color } from "three";

/** A zone's floor rug: a darker border with the zone colour inset. */
export function Rug({ rug }: { readonly rug: NonNullable<Zone["rug"]> }) {
	const border = new Color(rug.color).multiplyScalar(0.82).getStyle();
	return (
		<group position={[rug.center.x, 0, rug.center.z]}>
			<mesh position={[0, 0.012, 0]} receiveShadow>
				<boxGeometry args={[rug.width, 0.024, rug.depth]} />
				<meshStandardMaterial color={border} roughness={1} />
			</mesh>
			<mesh position={[0, 0.026, 0]} receiveShadow>
				<boxGeometry args={[rug.width - 0.24, 0.006, rug.depth - 0.24]} />
				<meshStandardMaterial color={rug.color} roughness={1} />
			</mesh>
		</group>
	);
}
