import { useCursor } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { AgentStatus } from "@shared/herdr/schema";
import { useState } from "react";
import { useScreenTexture } from "../../screens/useScreenTexture";
import { DYNAMIC } from "./StaticBatch";
import { MONITOR, SCREEN } from "./station";

const IDLE_SCREEN: Record<AgentStatus | "empty", string> = {
	working: "#3fae8a",
	idle: "#34495e",
	done: "#3f6fc0",
	blocked: "#d0643a",
	unknown: "#2a2f38",
	empty: "#1b1d22",
};

const BODY = "#2a2c31";
const HOVER_BEZEL = "#f2c66d";

export interface MonitorProps {
	readonly status: AgentStatus | "empty";
	/** The pane whose live screen this monitor mirrors. */
	readonly paneId: string | undefined;
	/** Hidden while this screen is focused (a real terminal covers it). */
	readonly live: boolean;
	readonly onOpen: (() => void) | undefined;
}

/** A desk monitor showing its agent's live terminal; click to open the screen. */
export function Monitor({ status, paneId, live, onOpen }: MonitorProps) {
	const [hovered, setHovered] = useState(false);
	useCursor(hovered && onOpen !== undefined);
	const { texture } = useScreenTexture(paneId, { visible: live });
	const handlers = {
		...(onOpen
			? {
					onClick: (event: ThreeEvent<MouseEvent>) => {
						event.stopPropagation();
						onOpen();
					},
				}
			: {}),
		...(onOpen
			? {
					onPointerOver: (event: ThreeEvent<PointerEvent>) => {
						event.stopPropagation();
						setHovered(true);
					},
					onPointerOut: () => setHovered(false),
				}
			: {}),
	};
	return (
		<group position={[0, MONITOR.y, MONITOR.z]} {...handlers}>
			<mesh position={[0, 0.01, -0.02]} castShadow>
				<boxGeometry args={[0.26, 0.02, 0.18]} />
				<meshStandardMaterial color={BODY} flatShading />
			</mesh>
			<mesh position={[0, 0.14, -0.04]} castShadow>
				<boxGeometry args={[0.06, 0.26, 0.05]} />
				<meshStandardMaterial color={BODY} flatShading />
			</mesh>
			<mesh position={[0, SCREEN.y, 0]} castShadow userData={DYNAMIC}>
				<boxGeometry args={[0.74, 0.46, 0.06]} />
				<meshStandardMaterial
					color={hovered ? HOVER_BEZEL : BODY}
					emissive={hovered ? HOVER_BEZEL : "#000000"}
					emissiveIntensity={hovered ? 0.35 : 0}
					flatShading
				/>
			</mesh>
			<mesh position={[0, SCREEN.y, SCREEN.z]} userData={DYNAMIC}>
				<planeGeometry args={[SCREEN.width, SCREEN.height]} />
				{texture && live ? (
					<meshBasicMaterial map={texture} toneMapped={false} />
				) : (
					<meshStandardMaterial
						color={IDLE_SCREEN[status]}
						emissive={IDLE_SCREEN[status]}
						emissiveIntensity={0.6}
					/>
				)}
			</mesh>
		</group>
	);
}
