import { useThree } from "@react-three/fiber";
import { type ItemRef, itemPosition, moveItem } from "@shared/layout/ops";
import { useCallback } from "react";
import { type Camera, Plane, Raycaster, Vector2, Vector3 } from "three";
import { useEdit } from "./edit-store";

const FLOOR = new Plane(new Vector3(0, 1, 0), 0);

/** Where a pointer event's ray meets the floor plane (y = 0). */
function floorPoint(event: PointerEvent, camera: Camera, element: HTMLElement): Vector3 | null {
	const rect = element.getBoundingClientRect();
	const ndc = new Vector2(
		((event.clientX - rect.left) / rect.width) * 2 - 1,
		-((event.clientY - rect.top) / rect.height) * 2 + 1,
	);
	const raycaster = new Raycaster();
	raycaster.setFromCamera(ndc, camera);
	return raycaster.ray.intersectPlane(FLOOR, new Vector3());
}

/**
 * Returns `startDrag(ref, pointerdown)`: the item follows the pointer across
 * the floor (snapped, clamped) until release, as one undo step, with map
 * panning disabled meanwhile.
 */
export function useFloorDrag(): (ref: ItemRef, down: PointerEvent) => void {
	const get = useThree((state) => state.get);
	return useCallback(
		(ref: ItemRef, down: PointerEvent) => {
			const { camera, gl, controls } = get();
			const draft = useEdit.getState().draft;
			const start = draft ? itemPosition(draft, ref) : undefined;
			const grab = floorPoint(down, camera, gl.domElement);
			if (!draft || !start || !grab) return;
			const orbit = controls && "enabled" in controls ? controls : null;
			const wasEnabled = orbit?.enabled === true;
			if (orbit) orbit.enabled = false;
			let moved = false;
			const onMove = (event: PointerEvent) => {
				const hit = floorPoint(event, camera, gl.domElement);
				if (!hit) return;
				const to = { x: start.x + hit.x - grab.x, z: start.z + hit.z - grab.z };
				const next = moveItem(draft, ref, to);
				const edit = useEdit.getState();
				const now = edit.draft ? itemPosition(edit.draft, ref) : undefined;
				const there = itemPosition(next, ref);
				if (now && there && now.x === there.x && now.z === there.z) return;
				if (!moved) edit.checkpoint();
				moved = true;
				edit.preview(next);
			};
			const onUp = () => {
				window.removeEventListener("pointermove", onMove);
				window.removeEventListener("pointerup", onUp);
				window.removeEventListener("pointercancel", onUp);
				if (orbit && wasEnabled) orbit.enabled = true;
			};
			window.addEventListener("pointermove", onMove);
			window.addEventListener("pointerup", onUp);
			window.addEventListener("pointercancel", onUp);
		},
		[get],
	);
}
