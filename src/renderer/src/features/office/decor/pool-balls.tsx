import { useFrame } from "@react-three/fiber";
import { BALL_COLORS, EIGHT_BALL, groupOf, POOL_TABLE, type PoolFrame } from "@shared/pool";
import { useMemo, useRef } from "react";
import {
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

/** Each ball's colour, made once: painting a frame allocates nothing. */
const TINTS = Array.from({ length: MAX_BALLS }, (_, id) => new Color(colourOf(id)));
const scratch = new Matrix4();

/** [id, x, y] for each ball on the table, as frames carry them. */
export type BallSpots = PoolFrame["balls"];

type SetName = "solids" | "white" | "rings";

/** How many instances each mesh shows after the last `paint` (reused, not reallocated). */
const counts = { solids: 0, white: 0, rings: 0 };

function place(mesh: InstancedMesh, slot: number, x: number, y: number): void {
	// Table space: pool x along x, pool y (counter-clockwise from x, seen from above) along -z.
	scratch.makeTranslation(x, POOL_SURFACE_Y + R, -y);
	mesh.setMatrixAt(slot, scratch);
}

/** Write `balls` into the three instanced meshes (solids and the 8, white balls, stripe rings); counts land in `counts`. */
function paint(
	solids: InstancedMesh,
	white: InstancedMesh,
	rings: InstancedMesh,
	balls: BallSpots,
): void {
	counts.solids = 0;
	counts.white = 0;
	counts.rings = 0;
	for (const [id, x, y] of balls) {
		const tint = TINTS[id];
		if (id >= 1 && id <= EIGHT_BALL) {
			place(solids, counts.solids, x, y);
			if (tint) solids.setColorAt(counts.solids, tint);
			counts.solids += 1;
			continue;
		}
		place(white, counts.white, x, y);
		counts.white += 1;
		if (groupOf(id) !== "stripes") continue;
		place(rings, counts.rings, x, y);
		if (tint) rings.setColorAt(counts.rings, tint);
		counts.rings += 1;
	}
}

/**
 * The balls on the table, in table space (the pool frame of `@shared/pool`,
 * metres, before the station scale): three instanced meshes whatever the
 * count. `read` is asked every frame and the meshes rewritten only when it
 * answers with a different array, so 30 Hz play costs no React work.
 */
export function PoolBalls({ read }: { readonly read: () => BallSpots }) {
	const meshes = useRef<Record<SetName, InstancedMesh | null>>({
		solids: null,
		white: null,
		rings: null,
	});
	const painted = useRef<BallSpots | null>(null);
	const refs = useMemo(() => {
		const slot = (name: SetName) => (mesh: InstancedMesh | null) => {
			meshes.current[name] = mesh;
		};
		return { solids: slot("solids"), white: slot("white"), rings: slot("rings") };
	}, []);
	useFrame(() => {
		const balls = read();
		const { solids, white, rings } = meshes.current;
		if (balls === painted.current || !solids || !white || !rings) return;
		painted.current = balls;
		paint(solids, white, rings, balls);
		solids.count = counts.solids;
		white.count = counts.white;
		rings.count = counts.rings;
		solids.instanceMatrix.needsUpdate = true;
		white.instanceMatrix.needsUpdate = true;
		rings.instanceMatrix.needsUpdate = true;
		if (solids.instanceColor) solids.instanceColor.needsUpdate = true;
		if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
	});
	return (
		<group userData={DYNAMIC}>
			<instancedMesh ref={refs.solids} args={[BALL, COLOURED, MAX_BALLS]} frustumCulled={false} />
			<instancedMesh ref={refs.white} args={[BALL, WHITE, MAX_BALLS]} frustumCulled={false} />
			<instancedMesh ref={refs.rings} args={[BAND, RING, MAX_BALLS]} frustumCulled={false} />
		</group>
	);
}
