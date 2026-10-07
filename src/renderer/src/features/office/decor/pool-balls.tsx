import { BALL_COLORS, EIGHT_BALL, groupOf, POOL_TABLE, type PoolBall } from "@shared/pool";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
	type BufferGeometry,
	Color,
	CylinderGeometry,
	IcosahedronGeometry,
	type InstancedMesh,
	Matrix4,
	MeshStandardMaterial,
} from "three";
import { DYNAMIC } from "../scene/StaticBatch";

/** Felt top in table space (metres, before the station scale); balls rest on it. */
export const POOL_SURFACE_Y = 0.62;

const R = POOL_TABLE.ballRadius;
const MAX_BALLS = 16;

/** Low-poly, like the rest of the office: twenty-ish facets read as a ball at any zoom. */
const BALL = new IcosahedronGeometry(R, 1);
/**
 * A stripe is a white ball wearing an open ring of its colour. The ring stands
 * on edge (axis level), so the colour shows from the office camera and from
 * straight above in table view, where a level ring would leave a white disc.
 */
const BAND = new CylinderGeometry(R * 1.05, R * 1.05, R * 1.05, 8, 1, true).rotateX(Math.PI / 2);

const COLOURED = new MeshStandardMaterial({ flatShading: true, roughness: 0.45 });
const RING = new MeshStandardMaterial({ flatShading: true, roughness: 0.45 });

const scratch = new Matrix4();
const tint = new Color();

/** Base colour of a ball: a stripe takes the colour of its number minus 8. */
function colourOf(id: number): string {
	const base = groupOf(id) === "stripes" ? id - EIGHT_BALL : id;
	return BALL_COLORS[base] ?? "#f4f1e8";
}

/** Near-white needs a little light of its own to stay white under the scene's tone mapping. */
const WHITE = new MeshStandardMaterial({
	color: colourOf(0),
	emissive: "#ffffff",
	emissiveIntensity: 0.22,
	flatShading: true,
	roughness: 0.45,
});

interface BallSetProps {
	readonly balls: readonly PoolBall[];
	readonly geometry: BufferGeometry;
	readonly material: MeshStandardMaterial;
	/** Tint each instance with its ball's colour (the material's own colour otherwise). */
	readonly tinted: boolean;
}

/** One instanced mesh holding `balls`, rewritten whenever they change. */
function BallSet({ balls, geometry, material, tinted }: BallSetProps) {
	const ref = useRef<InstancedMesh>(null);
	useLayoutEffect(() => {
		const mesh = ref.current;
		if (!mesh) return;
		balls.forEach((ball, index) => {
			// Table space: pool x along x, pool y (counter-clockwise from x, seen from above) along -z.
			scratch.makeTranslation(ball.x, POOL_SURFACE_Y + R, -ball.y);
			mesh.setMatrixAt(index, scratch);
			if (tinted) mesh.setColorAt(index, tint.set(colourOf(ball.id)));
		});
		mesh.count = balls.length;
		mesh.instanceMatrix.needsUpdate = true;
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
	}, [balls, tinted]);
	return <instancedMesh ref={ref} args={[geometry, material, MAX_BALLS]} frustumCulled={false} />;
}

/**
 * The balls still on the table, in table space (the pool frame of `@shared/pool`,
 * metres, before the station scale). Three instanced meshes whatever the count:
 * solids and the 8, white balls (cue and stripes), and the stripes' rings.
 */
export function PoolBalls({ balls }: { readonly balls: readonly PoolBall[] }) {
	const sets = useMemo(() => {
		const onTable = balls.filter((ball) => ball.pocket === null);
		const stripes = onTable.filter((ball) => groupOf(ball.id) === "stripes");
		return {
			solids: onTable.filter((ball) => ball.id >= 1 && ball.id <= EIGHT_BALL),
			white: onTable.filter((ball) => ball.id === 0 || stripes.includes(ball)),
			stripes,
		};
	}, [balls]);
	return (
		<group userData={DYNAMIC}>
			<BallSet balls={sets.solids} geometry={BALL} material={COLOURED} tinted />
			<BallSet balls={sets.white} geometry={BALL} material={WHITE} tinted={false} />
			<BallSet balls={sets.stripes} geometry={BAND} material={RING} tinted />
		</group>
	);
}
