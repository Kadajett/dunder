import { MapControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import type { Room } from "@shared/layout/schema";
import { useLayoutEffect, useMemo, useRef } from "react";
import { type OrthographicCamera, Vector3 } from "three";
import type { MapControls as MapControlsImpl } from "three-stdlib";
import { fitOrthographic, VIEW_DIRECTION } from "./camera-fit";
import {
	applyPose,
	type CameraPose,
	capturePose,
	easeInOutCubic,
	focusPose,
	lerpPose,
	projectScreen,
} from "./focus/camera-pose";
import { useFocus } from "./focus/focus-store";

const CAMERA_DISTANCE = 60;
const TWEEN_SECONDS = 0.45;

/** The room's silhouette: floor corners plus the tops of both walls. */
function roomPoints(room: Room): Vector3[] {
	const [w, d, h] = [room.width / 2, room.depth / 2, room.wallHeight];
	return [
		new Vector3(-w, 0, -d),
		new Vector3(w, 0, -d),
		new Vector3(-w, 0, d),
		new Vector3(w, 0, d),
		new Vector3(-w, h, -d),
		new Vector3(w, h, -d),
		new Vector3(-w, h, d),
	];
}

function overviewPose(points: readonly Vector3[], size: { width: number; height: number }) {
	const fit = fitOrthographic(points, size, 0.06);
	const position = fit.target.clone().addScaledVector(VIEW_DIRECTION, CAMERA_DISTANCE);
	return { fit, position };
}

interface Tween {
	readonly from: CameraPose;
	readonly to: CameraPose;
	readonly started: number;
	readonly done: () => void;
}

/**
 * Isometric orthographic camera framed on the room (pan and zoom only), plus
 * the focus tween: head-on to a clicked monitor and back to where it was.
 */
export function OfficeCamera({ room }: { readonly room: Room }) {
	const camera = useThree((state) => state.camera) as OrthographicCamera;
	const size = useThree((state) => state.size);
	const controls = useRef<MapControlsImpl>(null);
	const points = useMemo(() => roomPoints(room), [room]);
	const target = useFocus((state) => state.target);
	const phase = useFocus((state) => state.phase);
	const tween = useRef<Tween | null>(null);
	const saved = useRef<CameraPose | null>(null);
	const savedTarget = useRef<Vector3 | null>(null);

	useLayoutEffect(() => {
		if (useFocus.getState().phase !== null) return;
		const { fit, position } = overviewPose(points, size);
		camera.position.copy(position);
		camera.near = 0.1;
		camera.far = CAMERA_DISTANCE * 3;
		camera.zoom = fit.zoom;
		camera.lookAt(fit.target);
		camera.updateProjectionMatrix();
		controls.current?.target.copy(fit.target);
		controls.current?.update();
	}, [camera, points, size]);

	// drei's MapControls calls update() every frame even when disabled, and update()
	// re-aims the camera at controls.target; keep that target on whatever we look at.
	useLayoutEffect(() => {
		const focus = useFocus.getState();
		const orbit = controls.current;
		if (phase === "entering" && target) {
			saved.current = capturePose(camera);
			savedTarget.current = orbit?.target.clone() ?? null;
			const { x, y, z } = target.screen.center;
			tween.current = {
				from: capturePose(camera),
				to: focusPose(target.screen, size),
				started: performance.now(),
				done: () => {
					orbit?.target.set(x, y, z);
					focus.settled(projectScreen(target.screen, camera, size));
				},
			};
		} else if (phase === "focused" && target && !tween.current) {
			// Window resized while focused: re-frame and move the terminal with it.
			applyPose(camera, focusPose(target.screen, size));
			focus.settled(projectScreen(target.screen, camera, size));
		} else if (phase === "leaving" && saved.current) {
			const back = saved.current;
			const backTarget = savedTarget.current;
			tween.current = {
				from: capturePose(camera),
				to: back,
				started: performance.now(),
				done: () => {
					if (backTarget) orbit?.target.copy(backTarget);
					useFocus.getState().returned();
				},
			};
		}
	}, [camera, phase, target, size]);

	useFrame(() => {
		const active = tween.current;
		if (!active) return;
		const t = Math.min(1, (performance.now() - active.started) / (TWEEN_SECONDS * 1000));
		applyPose(camera, lerpPose(active.from, active.to, easeInOutCubic(t)));
		if (t < 1) return;
		tween.current = null;
		active.done();
	});

	return (
		<MapControls
			ref={controls}
			makeDefault
			enabled={phase === null}
			enableRotate={false}
			enableDamping
			dampingFactor={0.12}
			screenSpacePanning
			minZoom={12}
			maxZoom={260}
		/>
	);
}
