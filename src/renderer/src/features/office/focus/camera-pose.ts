import { POOL_TABLE } from "@shared/pool";
import { Matrix4, type OrthographicCamera, Quaternion, Vector3 } from "three";
import {
	TABLE_OUTER,
	type TablePlacement,
	type TablePoint,
	tableToWorld,
} from "../../pool/table-space";
import { POOL_SURFACE_Y } from "../decor/pool-balls";
import { type ScreenPlacement, STATION_SCALE } from "../scene/station";
import type { FocusTarget, ScreenRect } from "./focus-store";

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

/** Share of the framing area the pool table's outer rim fills along its tighter axis. */
const TABLE_FILL = 0.8;
/** World height of the cloth: the decor's surface at station scale. */
export const CLOTH_Y = POOL_SURFACE_Y * STATION_SCALE;
/**
 * Everything more than this far above the cloth is clipped (lamps, the ceiling);
 * standing agents (heads ≈2.2 m, ≈1.43 m above the cloth) stay drawn around the rim.
 */
const CLIP_ABOVE_CLOTH = 1.8;
/**
 * Tilt off straight down, toward the table's −y side. Orbit controls re-aim the
 * camera with world-up every frame, which is undefined when looking straight
 * down; this tilt keeps the table's +y up on screen (foreshortening ≈ 5e-5).
 */
const TOP_DOWN_TILT = 0.01;

function clothPoint(table: TablePlacement, point: TablePoint): Vector3 {
	const world = tableToWorld(table, point);
	return new Vector3(world.x, CLOTH_Y, world.z);
}

/**
 * (Nearly) top-down pose over the pool table: its long axis horizontal with the
 * head end (−x) on the left and table +y up, the outer rim filling 80% of
 * `area` and centred there.
 */
export function tablePose(
	table: TablePlacement,
	viewport: Viewport,
	area: ScreenRect = { left: 0, top: 0, ...viewport },
): CameraPose {
	const center = clothPoint(table, { x: 0, y: 0 });
	const plusY = clothPoint(table, { x: 0, y: 1 }).sub(center).normalize();
	const back = new Vector3(0, Math.cos(TOP_DOWN_TILT), 0).addScaledVector(
		plusY,
		-Math.sin(TOP_DOWN_TILT),
	);
	const above = center.clone().addScaledVector(back, FOCUS_DISTANCE);
	const rotation = new Matrix4().lookAt(above, center, new Vector3(0, 1, 0));
	const zoom = Math.min(
		(area.width * TABLE_FILL) / (2 * TABLE_OUTER.x * STATION_SCALE),
		(area.height * TABLE_FILL) / (2 * TABLE_OUTER.y * STATION_SCALE),
	);
	// Pixels the table centre must move (right, down) to land on the area's centre.
	const dx = area.left + area.width / 2 - viewport.width / 2;
	const dy = area.top + area.height / 2 - viewport.height / 2;
	const right = new Vector3(1, 0, 0).applyMatrix4(rotation);
	const up = new Vector3(0, 1, 0).applyMatrix4(rotation);
	const position = above.addScaledVector(right, -dx / zoom).addScaledVector(up, dy / zoom);
	return {
		position,
		quaternion: new Quaternion().setFromRotationMatrix(rotation),
		zoom,
		near: FOCUS_DISTANCE - CLIP_ABOVE_CLOTH,
		far: FOCUS_DISTANCE + 40,
	};
}

/** The settled pose for a focus target. */
export function targetPose(target: FocusTarget, viewport: Viewport, area: ScreenRect): CameraPose {
	return target.kind === "screen"
		? focusPose(target.screen, viewport, area)
		: tablePose(target.table, viewport, area);
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

function boundingRect(
	corners: readonly Vector3[],
	camera: OrthographicCamera,
	viewport: Viewport,
): ScreenRect {
	const points = corners.map((corner) => {
		const ndc = corner.clone().project(camera);
		return { x: ((ndc.x + 1) / 2) * viewport.width, y: ((1 - ndc.y) / 2) * viewport.height };
	});
	const xs = points.map((c) => c.x);
	const ys = points.map((c) => c.y);
	const left = Math.min(...xs);
	const top = Math.min(...ys);
	return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}

const SIGNS = [
	[1, 1],
	[1, -1],
	[-1, 1],
	[-1, -1],
] as const;

/** Bounding rectangle, in CSS pixels, of the screen's four corners as the camera sees them. */
export function projectScreen(
	screen: ScreenPlacement,
	camera: OrthographicCamera,
	viewport: Viewport,
): ScreenRect {
	const right = new Vector3(screen.normal.z, 0, -screen.normal.x).multiplyScalar(screen.width / 2);
	const up = new Vector3(0, screen.height / 2, 0);
	const center = new Vector3(screen.center.x, screen.center.y, screen.center.z);
	const corners = SIGNS.map(([sx, sy]) =>
		center.clone().addScaledVector(right, sx).addScaledVector(up, sy),
	);
	return boundingRect(corners, camera, viewport);
}

/**
 * Bounding rectangle, in CSS pixels, of the cloth (the playing surface) as the
 * camera sees it; under `tablePose` it maps table metres linearly (+x right, +y up).
 */
export function projectTable(
	table: TablePlacement,
	camera: OrthographicCamera,
	viewport: Viewport,
): ScreenRect {
	const corners = SIGNS.map(([sx, sy]) =>
		clothPoint(table, { x: (sx * POOL_TABLE.length) / 2, y: (sy * POOL_TABLE.width) / 2 }),
	);
	return boundingRect(corners, camera, viewport);
}

/** Where the focus target sits on screen once settled: the monitor, or the table's cloth. */
export function projectTarget(
	target: FocusTarget,
	camera: OrthographicCamera,
	viewport: Viewport,
): ScreenRect {
	return target.kind === "screen"
		? projectScreen(target.screen, camera, viewport)
		: projectTable(target.table, camera, viewport);
}
