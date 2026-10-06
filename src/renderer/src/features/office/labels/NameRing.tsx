import { useCursor } from "@react-three/drei";
import { type ThreeEvent, useThree } from "@react-three/fiber";
import type { AgentStatus } from "@shared/herdr/schema";
import { useEffect, useMemo, useState } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";
import { useSelection } from "../interaction/selection-store";
import { NameRingCanvas, RING_CANVAS, RING_FONT, RING_INNER, RING_OUTER } from "./name-ring";

/** Just above the rugs (their top is at 0.029), so the ring only ever covers floor and rugs. */
const FLOOR_LIFT = 0.034;
/** The camera looks from +x/+z: turn the canvas's bottom edge (the name) toward it. */
const FACE_CAMERA = Math.PI / 4;
const LIE_FLAT = -Math.PI / 2;

/** True once the ring's font has loaded (or failed to), so the name is not first painted in a fallback face. */
function useRingFont(): boolean {
	const [ready, setReady] = useState(() => document.fonts.check(RING_FONT));
	useEffect(() => {
		if (ready) return;
		let live = true;
		const settle = (): void => {
			if (live) setReady(true);
		};
		void document.fonts.load(RING_FONT).then(settle, settle);
		return () => {
			live = false;
		};
	}, [ready]);
	return ready;
}

/**
 * An agent's name written in a ring on the floor around its feet, in place of
 * a floating tag: it never covers monitors. Place it at the agent's floor
 * position without the body's rotation, so the name always faces the camera.
 * Hovering or selecting the agent lights the ring; clicks bubble to the
 * agent's Clickable.
 */
export function NameRing(props: {
	readonly name: string;
	readonly status: AgentStatus;
	readonly paneId: string;
}) {
	const { name, status, paneId } = props;
	const invalidate = useThree((state) => state.invalidate);
	const selected = useSelection(
		(state) => state.selection?.kind === "agent" && state.selection.paneId === paneId,
	);
	const [hovered, setHovered] = useState(false);
	useCursor(hovered);
	const fontReady = useRingFont();
	const ring = useMemo(() => {
		const canvas = document.createElement("canvas");
		canvas.width = RING_CANVAS;
		canvas.height = RING_CANVAS;
		const texture = new CanvasTexture(canvas);
		texture.colorSpace = SRGBColorSpace;
		const ctx = canvas.getContext("2d");
		return { painter: ctx ? new NameRingCanvas(ctx) : null, texture };
	}, []);
	useEffect(() => () => ring.texture.dispose(), [ring]);
	const highlighted = hovered || selected;
	useEffect(() => {
		if (!ring.painter || !fontReady) return;
		ring.painter.paint({ name, status, highlighted });
		ring.texture.needsUpdate = true;
		invalidate();
	}, [ring, name, status, highlighted, fontReady, invalidate]);
	return (
		<group rotation={[0, FACE_CAMERA, 0]}>
			<mesh
				rotation={[LIE_FLAT, 0, 0]}
				position={[0, FLOOR_LIFT, 0]}
				renderOrder={1}
				onPointerOver={(event: ThreeEvent<PointerEvent>) => {
					event.stopPropagation();
					setHovered(true);
				}}
				onPointerOut={() => setHovered(false)}
			>
				{/* A ring, not a plane: only the band itself takes the pointer, never the floor inside or around it. */}
				<ringGeometry args={[RING_INNER, RING_OUTER, 64]} />
				<meshBasicMaterial map={ring.texture} transparent depthWrite={false} toneMapped={false} />
			</mesh>
		</group>
	);
}
