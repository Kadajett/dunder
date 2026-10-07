import { useCursor } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { AgentStatus } from "@shared/herdr/schema";
import type { Desk } from "@shared/layout/schema";
import { useState } from "react";
import { PALETTE } from "../decor/palette";
import { Monitor } from "./Monitor";
import { DYNAMIC } from "./StaticBatch";
import { DEG, SEAT_Z, STATION_SCALE } from "./station";

const HOVER_GLOW = "#f2c66d";

function Chair({ color }: { readonly color: string }) {
	return (
		<group position={[0, 0, SEAT_Z]}>
			<mesh position={[0, 0.03, 0]} castShadow>
				<boxGeometry args={[0.5, 0.05, 0.08]} />
				<meshStandardMaterial color="#2b2d33" flatShading />
			</mesh>
			<mesh position={[0, 0.03, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
				<boxGeometry args={[0.5, 0.05, 0.08]} />
				<meshStandardMaterial color="#2b2d33" flatShading />
			</mesh>
			<mesh position={[0, 0.24, 0]} castShadow>
				<cylinderGeometry args={[0.03, 0.03, 0.4, 6]} />
				<meshStandardMaterial color="#2b2d33" flatShading />
			</mesh>
			<mesh position={[0, 0.46, 0]} castShadow receiveShadow>
				<boxGeometry args={[0.52, 0.09, 0.5]} />
				<meshStandardMaterial color={color} flatShading />
			</mesh>
			<mesh position={[0, 0.68, 0.25]} castShadow>
				<boxGeometry args={[0.5, 0.36, 0.08]} />
				<meshStandardMaterial color={color} flatShading />
			</mesh>
		</group>
	);
}

function DeskBody({ hovered }: { readonly hovered: boolean }) {
	return (
		<group>
			<mesh position={[0, 0.73, 0]} castShadow receiveShadow userData={DYNAMIC}>
				<boxGeometry args={[1.5, 0.07, 0.82]} />
				<meshStandardMaterial
					color={hovered ? PALETTE.deskTopHover : PALETTE.deskTop}
					emissive={hovered ? HOVER_GLOW : "#000000"}
					emissiveIntensity={hovered ? 0.18 : 0}
					flatShading
				/>
			</mesh>
			{[-0.69, 0.69].map((x) => (
				<mesh key={x} position={[x, 0.35, 0]} castShadow receiveShadow>
					<boxGeometry args={[0.07, 0.7, 0.74]} />
					<meshStandardMaterial color={PALETTE.deskSide} flatShading />
				</mesh>
			))}
			<mesh position={[0, 0.5, -0.33]} castShadow>
				<boxGeometry args={[1.32, 0.36, 0.04]} />
				<meshStandardMaterial color={PALETTE.deskSide} flatShading />
			</mesh>
			<mesh position={[0, 0.78, 0.18]} castShadow>
				<boxGeometry args={[0.46, 0.025, 0.15]} />
				<meshStandardMaterial color="#ece6da" flatShading />
			</mesh>
			<mesh position={[0.48, 0.775, 0.06]} rotation={[0, 0.3, 0]}>
				<boxGeometry args={[0.24, 0.012, 0.32]} />
				<meshStandardMaterial color="#fbf7ee" flatShading />
			</mesh>
		</group>
	);
}

export interface DeskStationProps {
	readonly desk: Desk;
	readonly status: AgentStatus | "empty";
	readonly paneId: string | undefined;
	/** False while this desk's screen is focused and a real terminal covers it. */
	readonly screenLive: boolean;
	readonly onHoverAgent: (() => void) | undefined;
	/** Opens this desk's screen (or, at your desk, the Chief of Staff); the desk itself is clickable too. */
	readonly onOpenScreen: (() => void) | undefined;
}

/** One workstation: desk, live monitor and chair. Its agent is drawn by `AgentActor`. */
export function DeskStation({
	desk,
	status,
	paneId,
	screenLive,
	onHoverAgent,
	onOpenScreen,
}: DeskStationProps) {
	const [hovered, setHovered] = useState(false);
	const lit = hovered && onOpenScreen !== undefined;
	useCursor(lit);
	const handlers = onOpenScreen
		? {
				onClick: (event: ThreeEvent<MouseEvent>) => {
					event.stopPropagation();
					onOpenScreen();
				},
				onPointerOver: (event: ThreeEvent<PointerEvent>) => {
					event.stopPropagation();
					setHovered(true);
				},
				onPointerOut: () => setHovered(false),
			}
		: {};
	return (
		<group
			position={[desk.position.x, 0, desk.position.z]}
			rotation={[0, desk.rotation * DEG, 0]}
			scale={STATION_SCALE}
		>
			<group {...handlers}>
				<DeskBody hovered={lit} />
			</group>
			<Monitor
				status={status}
				paneId={paneId}
				live={screenLive}
				onOpen={onOpenScreen}
				onHoverAgent={onHoverAgent}
			/>
			<Chair color={desk.chairColor} />
		</group>
	);
}
