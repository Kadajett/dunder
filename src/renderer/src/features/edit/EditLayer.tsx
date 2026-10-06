import { Edges, useCursor } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { ItemRef } from "@shared/layout/ops";
import type { Layout } from "@shared/layout/schema";
import { useState } from "react";
import { useEdit } from "./edit-store";
import { editableItems, type HandleBox, handleBox } from "./handles";
import { useFloorDrag } from "./useFloorDrag";

const SELECTED = "#e0a526";
const HOVERED = "#f2c66d";

function EditHandle(props: {
	readonly item: ItemRef;
	readonly box: HandleBox;
	readonly selected: boolean;
	readonly onGrab: (item: ItemRef, event: PointerEvent) => void;
}) {
	const { item, box, selected, onGrab } = props;
	const [hovered, setHovered] = useState(false);
	useCursor(hovered, selected ? "move" : "pointer");
	const lit = selected || hovered;
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: a three.js <mesh>, not DOM; R3F delivers raycast pointer events.
		<mesh
			position={box.center}
			rotation={[0, box.rotationY, 0]}
			onPointerDown={(event: ThreeEvent<PointerEvent>) => {
				if (event.button !== 0) return;
				event.stopPropagation();
				useEdit.getState().select(item);
				onGrab(item, event.nativeEvent);
			}}
			onClick={(event: ThreeEvent<MouseEvent>) => event.stopPropagation()}
			onPointerOver={(event: ThreeEvent<PointerEvent>) => {
				event.stopPropagation();
				setHovered(true);
			}}
			onPointerOut={() => setHovered(false)}
		>
			<boxGeometry args={box.size} />
			<meshBasicMaterial
				color={SELECTED}
				transparent
				opacity={selected ? 0.16 : 0}
				depthWrite={false}
				toneMapped={false}
			/>
			{lit ? (
				<Edges color={selected ? SELECTED : HOVERED} lineWidth={selected ? 2.5 : 1.5} />
			) : null}
		</mesh>
	);
}

/** Floating labels have no body; edit mode shows a post under each one so it can be grabbed. */
function CalloutPost({ box }: { readonly box: HandleBox }) {
	return (
		<mesh position={box.center}>
			<cylinderGeometry args={[0.05, 0.05, box.size[1], 8]} />
			<meshBasicMaterial color="#8a7a63" transparent opacity={0.55} toneMapped={false} />
		</mesh>
	);
}

/**
 * Edit mode's scene layer: a pick box over every desk, decor item, zone rug
 * and label. Pressing one selects it; dragging moves it across the floor.
 */
export function EditLayer({ layout }: { readonly layout: Layout }) {
	const selected = useEdit((state) => state.selected);
	const grab = useFloorDrag();
	return (
		<group>
			{editableItems(layout).map((item) => {
				const box = handleBox(layout, item);
				if (!box) return null;
				const key = `${item.kind}:${item.id}`;
				const isSelected = selected?.kind === item.kind && selected.id === item.id;
				return (
					<group key={key}>
						{item.kind === "callout" ? <CalloutPost box={box} /> : null}
						<EditHandle item={item} box={box} selected={isSelected} onGrab={grab} />
					</group>
				);
			})}
		</group>
	);
}
