import { Vector3 } from "three";

/** Isometric-ish viewing direction: from +x/+z, slightly flatter than true isometric. */
export const VIEW_DIRECTION = new Vector3(1, 0.86, 1).normalize();

export interface Fit {
	readonly zoom: number;
	/** World point the camera should look at so the points are centred. */
	readonly target: Vector3;
}

/**
 * Orthographic zoom (pixels per world unit) and look-at target that frame
 * `points` inside a `width`×`height` viewport, leaving `margin` (0–1) free.
 */
export function fitOrthographic(
	points: readonly Vector3[],
	viewport: { readonly width: number; readonly height: number },
	margin = 0.08,
): Fit {
	const forward = VIEW_DIRECTION.clone().negate();
	const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize();
	const up = new Vector3().crossVectors(right, forward).normalize();
	const xs = points.map((point) => point.dot(right));
	const ys = points.map((point) => point.dot(up));
	const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
	const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
	const usable = 1 - margin;
	const zoom = Math.min(
		(viewport.width * usable) / (maxX - minX),
		(viewport.height * usable) / (maxY - minY),
	);
	const target = right
		.clone()
		.multiplyScalar((minX + maxX) / 2)
		.add(up.clone().multiplyScalar((minY + maxY) / 2));
	return { zoom, target };
}
