import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import type { Zone } from "@shared/layout/schema";
import { useEffect, useState } from "react";
import { Plane, Raycaster, Vector2, Vector3 } from "three";
import { hoverZoneAt } from "./zone-hover";

const FLOOR = new Plane(new Vector3(0, 1, 0), 0);
/** Captions sit low, near the objects they name, rather than floating like cards. */
const CAPTION_HEIGHT = 1.3;
const OVERLAY_STYLE = { pointerEvents: "none" } as const;

/**
 * The hover-labelled zone under the pointer: where its ray meets the floor,
 * worked out on each pointer move over the canvas; none once it leaves.
 */
export function useHoveredZone(zones: readonly Zone[]): string | null {
	const [hovered, setHovered] = useState<string | null>(null);
	const element = useThree((state) => state.gl.domElement);
	const camera = useThree((state) => state.camera);
	useEffect(() => {
		const raycaster = new Raycaster();
		const pointer = new Vector2();
		const hit = new Vector3();
		const move = (event: PointerEvent): void => {
			const rect = element.getBoundingClientRect();
			pointer.set(
				((event.clientX - rect.left) / rect.width) * 2 - 1,
				-((event.clientY - rect.top) / rect.height) * 2 + 1,
			);
			raycaster.setFromCamera(pointer, camera);
			const onFloor = raycaster.ray.intersectPlane(FLOOR, hit);
			setHovered(hoverZoneAt(zones, onFloor ? { x: onFloor.x, z: onFloor.z } : null));
		};
		const leave = (): void => setHovered(null);
		element.addEventListener("pointermove", move);
		element.addEventListener("pointerleave", leave);
		return () => {
			element.removeEventListener("pointermove", move);
			element.removeEventListener("pointerleave", leave);
		};
	}, [element, camera, zones]);
	return hovered;
}

/**
 * A hover-mode zone's label: its title as a small lowercase caption near the
 * zone, faded in only while the zone is hovered. Always mounted, so showing it
 * never shifts anything.
 */
export function ZoneCaption(props: { readonly zone: Zone; readonly visible: boolean }) {
	const { zone } = props;
	const at = zone.labelAt ?? zone.rug?.center;
	if (!at) return null;
	return (
		<Html
			position={[at.x, CAPTION_HEIGHT, at.z]}
			center
			zIndexRange={[20, 10]}
			style={OVERLAY_STYLE}
		>
			<span className="zone-caption" data-visible={props.visible}>
				{zone.title.toLowerCase()}
			</span>
		</Html>
	);
}
