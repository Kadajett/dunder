import { useCursor } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { type ReactNode, useState } from "react";

export interface ClickableProps {
	readonly onSelect: () => void;
	readonly children: ReactNode;
	/** Radius of the highlight ring drawn on the floor while hovered; none if omitted. */
	readonly ring?: number;
	/** Told when the pointer enters or leaves, e.g. to reveal a caption. */
	readonly onHoverChange?: (hovered: boolean) => void;
}

/** Makes a piece of the world hoverable (pointer + floor ring) and clickable. */
export function Clickable({ onSelect, children, ring, onHoverChange }: ClickableProps) {
	const [hovered, setHovered] = useState(false);
	useCursor(hovered);
	const hover = (next: boolean): void => {
		setHovered(next);
		onHoverChange?.(next);
	};
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: a three.js <group>, not DOM; R3F delivers raycast pointer events.
		<group
			onClick={(event: ThreeEvent<MouseEvent>) => {
				event.stopPropagation();
				onSelect();
			}}
			onPointerOver={(event: ThreeEvent<PointerEvent>) => {
				event.stopPropagation();
				hover(true);
			}}
			onPointerOut={() => hover(false)}
		>
			{children}
			{ring !== undefined && hovered ? (
				<mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
					<ringGeometry args={[ring, ring + 0.09, 40]} />
					<meshBasicMaterial color="#f2c66d" transparent opacity={0.9} toneMapped={false} />
				</mesh>
			) : null}
		</group>
	);
}
