import { Block } from "../office/decor/parts";
import { Clickable } from "../office/interaction/Clickable";
import { DYNAMIC } from "../office/scene/StaticBatch";
import { useBoardTexture } from "./useBoardTexture";
import { useWhiteboard } from "./whiteboard-store";

/** Writing surface (2:1, as the texture), aluminium frame and depth off the wall. */
const FACE_W = 2.2;
const FACE_H = 1.1;
const FRAME = 0.05;
const DEPTH = 0.05;
const FRAME_COLOR = "#c3c7cc";
/** Marker colours on the tray: black, blue, red. */
const MARKERS = ["#1d1d1d", "#4465e9", "#e03131"] as const;

function MarkerTray() {
	const y = -FACE_H / 2 - FRAME - 0.02;
	return (
		<group position={[0, y, 0]}>
			<Block size={[FACE_W * 0.5, 0.03, 0.12]} position={[0, 0, 0.06]} color={FRAME_COLOR} />
			{MARKERS.map((color, index) => (
				<Block
					key={color}
					size={[0.16, 0.025, 0.025]}
					position={[-0.25 + index * 0.22, 0.028, 0.08]}
					color={color}
					noShadow
				/>
			))}
		</group>
	);
}

/**
 * The office whiteboard on the wall: centred on the origin, back plane at
 * z = 0, facing +z. Its face is the live board (agents' notes show up
 * as they post them); a click opens the editor.
 */
export function WallWhiteboard() {
	const texture = useBoardTexture();
	const open = useWhiteboard((state) => state.setOpen);
	return (
		<Clickable onSelect={() => open(true)}>
			<Block
				size={[FACE_W + FRAME * 2, FACE_H + FRAME * 2, DEPTH]}
				position={[0, 0, DEPTH / 2]}
				color={FRAME_COLOR}
				roughness={0.4}
			/>
			{/* Its texture changes whenever the board does: never part of the static batch. */}
			<mesh position={[0, 0, DEPTH + 0.002]} userData={DYNAMIC}>
				<planeGeometry args={[FACE_W, FACE_H]} />
				<meshBasicMaterial map={texture} toneMapped={false} />
			</mesh>
			<MarkerTray />
		</Clickable>
	);
}
