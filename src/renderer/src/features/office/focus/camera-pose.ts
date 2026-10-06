import { Matrix4, type OrthographicCamera, Quaternion, Vector3 } from "three";
import type { ScreenPlacement } from "../scene/station";
import type { ScreenRect } from "./focus-store";

/** Everything the tween animates on the orthographic camera. */
export interface CameraPose {
	readonly position: Vector3;
	readonly quaternion: Quaternion;
	readonly zoom: number;
	readonly near: number;
	readonly far: number;
}

/** Camera distance from the screen when focused (orthographic: only clipping depends on it). */
const FOCUS_DISTANCE = 20;
/**
 * Everything more than this far in front of the screen is clipped: the seated
 * agent and the desks in front would otherwise block a head-on view.
 */
const CLIP_IN_FRONT = 0.5;

export function capturePose(camera: OrthographicCamera): CameraPose {
	return {
		position: camera.position.clone(),
		quaternion: camera.quaternion.clone(),
		zoom: camera.zoom,
		near: camera.near,
		far: camera.far,
	};
}

/** Share of the framing area the focused screen fills along its tighter axis. */
const FOCUS_FILL = 0.7;

type Viewport = { readonly width: number; readonly height: number };

/**
 * Head-on pose that makes the screen fill 70% of `area` (default: the whole
 * viewport) and centres it there. Off-centre areas slide the camera sideways
 * without turning it, so the screen stays head-on.
 */
export function focusPose(
	screen: ScreenPlacement,
	viewport: Viewport,
	area: ScreenRect = { left: 0, top: 0, ...viewport },
): CameraPose {
	const center = new Vector3(screen.center.x, screen.center.y, screen.center.z);
	const normal = new Vector3(screen.normal.x, 0, screen.normal.z);
	const headOn = center.clone().addScaledVector(normal, FOCUS_DISTANCE);
	const rotation = new Matrix4().lookAt(headOn, center, new Vector3(0, 1, 0));
	const zoom = Math.min(
		(area.width * FOCUS_FILL) / screen.width,
		(area.height * FOCUS_FILL) / screen.height,
	);
	// Pixels the screen centre must move (right, down) to land on the area's centre.
	const dx = area.left + area.width / 2 - viewport.width / 2;
	const dy = area.top + area.height / 2 - viewport.height / 2;
	const right = new Vector3(normal.z, 0, -normal.x);
	const position = headOn.addScaledVector(right, -dx / zoom).add(new Vector3(0, dy / zoom, 0));
	return {
		position,
		quaternion: new Quaternion().setFromRotationMatrix(rotation),
		zoom,
		near: FOCUS_DISTANCE - CLIP_IN_FRONT,
		far: FOCUS_DISTANCE + 40,
	};
}

/** The point a focus pose looks at, on the screen's plane; orbit controls must aim there. */
export function focusLookAt(pose: CameraPose): Vector3 {
	const forward = new Vector3(0, 0, -1).applyQuaternion(pose.quaternion);
	return pose.position.clone().addScaledVector(forward, FOCUS_DISTANCE);
}

export function easeInOutCubic(t: number): number {
	return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Interpolate poses; zoom moves geometrically so the scale change feels even. */
export function lerpPose(from: CameraPose, to: CameraPose, t: number): CameraPose {
	return {
		position: from.position.clone().lerp(to.position, t),
		quaternion: from.quaternion.clone().slerp(to.quaternion, t),
		zoom: from.zoom * (to.zoom / from.zoom) ** t,
		near: from.near + (to.near - from.near) * t,
		far: from.far + (to.far - from.far) * t,
	};
}

export function applyPose(camera: OrthographicCamera, pose: CameraPose): void {
	camera.position.copy(pose.position);
	camera.quaternion.copy(pose.quaternion);
	Object.assign(camera, { zoom: pose.zoom, near: pose.near, far: pose.far });
	camera.updateProjectionMatrix();
	camera.updateMatrixWorld();
}

/** Bounding rectangle, in CSS pixels, of the screen's four corners as the camera sees them. */
export function projectScreen(
	screen: ScreenPlacement,
	camera: OrthographicCamera,
	viewport: { readonly width: number; readonly height: number },
): ScreenRect {
	const right = new Vector3(screen.normal.z, 0, -screen.normal.x).multiplyScalar(screen.width / 2);
	const up = new Vector3(0, screen.height / 2, 0);
	const center = new Vector3(screen.center.x, screen.center.y, screen.center.z);
	const corners = [
		[1, 1],
		[1, -1],
		[-1, 1],
		[-1, -1],
	].map(([sx = 0, sy = 0]) => {
		const ndc = center.clone().addScaledVector(right, sx).addScaledVector(up, sy).project(camera);
		return { x: ((ndc.x + 1) / 2) * viewport.width, y: ((1 - ndc.y) / 2) * viewport.height };
	});
	const xs = corners.map((c) => c.x);
	const ys = corners.map((c) => c.y);
	const left = Math.min(...xs);
	const top = Math.min(...ys);
	return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}
