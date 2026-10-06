import type { Zone } from "@shared/layout/schema";
import { Color } from "three";

/** Rugs keep their zone's hue but read as a soft tint on the floor, like the reference. */
const SATURATION = 0.55;
const LIFT = 0.04;
const BORDER = 0.08;

/** A zone's floor rug: a muted, slightly lifted zone colour inside a thin, slightly darker border. */
export function Rug({ rug }: { readonly rug: NonNullable<Zone["rug"]> }) {
	const hsl = new Color(rug.color).getHSL({ h: 0, s: 0, l: 0 });
	const inset = new Color().setHSL(hsl.h, hsl.s * SATURATION, Math.min(1, hsl.l + LIFT));
	const border = inset.clone().multiplyScalar(0.9);
	return (
		<group position={[rug.center.x, 0, rug.center.z]}>
			<mesh position={[0, 0.012, 0]} receiveShadow>
				<boxGeometry args={[rug.width, 0.024, rug.depth]} />
				<meshStandardMaterial color={border} roughness={1} />
			</mesh>
			<mesh position={[0, 0.026, 0]} receiveShadow>
				<boxGeometry args={[rug.width - BORDER * 2, 0.006, rug.depth - BORDER * 2]} />
				<meshStandardMaterial color={inset} roughness={1} />
			</mesh>
		</group>
	);
}
