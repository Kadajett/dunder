import { MapControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import type { Room } from "@shared/layout/schema";
import { useLayoutEffect, useMemo, useRef } from "react";
import { type OrthographicCamera, Vector3 } from "three";
import type { MapControls as MapControlsImpl } from "three-stdlib";
import { fitOrthographic, VIEW_DIRECTION } from "./camera-fit";

const CAMERA_DISTANCE = 60;

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

/**
 * Isometric orthographic camera framed on the room; pan and zoom only.
 * Refits whenever the viewport size changes.
 */
export function OfficeCamera({ room }: { readonly room: Room }) {
	const camera = useThree((state) => state.camera) as OrthographicCamera;
	const size = useThree((state) => state.size);
	const controls = useRef<MapControlsImpl>(null);
	const points = useMemo(() => roomPoints(room), [room]);

	useLayoutEffect(() => {
		const fit = fitOrthographic(points, size, 0.06);
		camera.position.copy(fit.target).addScaledVector(VIEW_DIRECTION, CAMERA_DISTANCE);
		camera.near = 0.1;
		camera.far = CAMERA_DISTANCE * 3;
		camera.zoom = fit.zoom;
		camera.lookAt(fit.target);
		camera.updateProjectionMatrix();
		controls.current?.target.copy(fit.target);
		controls.current?.update();
	}, [camera, points, size]);

	return (
		<MapControls
			ref={controls}
			makeDefault
			enableRotate={false}
			enableDamping
			dampingFactor={0.12}
			screenSpacePanning
			minZoom={12}
			maxZoom={260}
		/>
	);
}
