import { Text } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { Group } from "three";
import { ringBell } from "../../calisthenics/workout-store";
import { FONTS } from "../fonts";
import { Clickable } from "../interaction/Clickable";
import { PALETTE } from "./palette";
import { Ball, Block, Cylinder } from "./parts";
import type { DecorProps } from "./props";

// Wall-mounted kinds: centred on the local origin, back plane at z = 0, protruding toward +z.

const FACE_FORWARD: [number, number, number] = [Math.PI / 2, 0, 0];
const TAU = Math.PI * 2;

/** Seconds a rung bell keeps swinging. */
const SWING_SECONDS = 2.5;

/**
 * Matte mustard bell on a slim wall hanger; `label` is painted on the wall beneath.
 * Ringing it (a click) calls everyone to a workout.
 */
export function WallBell({ label }: DecorProps) {
	const brass = { color: PALETTE.bellMustard, metalness: 0.15, roughness: 0.6 } as const;
	const hangZ = 0.18;
	const bell = useRef<Group>(null);
	const clock = useThree((state) => state.clock);
	const rungAt = useRef(Number.NEGATIVE_INFINITY);
	useFrame(() => {
		const group = bell.current;
		if (!group) return;
		// Damped swing after a ring, settling by itself.
		const t = clock.elapsedTime - rungAt.current;
		group.rotation.z = t < SWING_SECONDS ? 0.45 * Math.exp(-1.8 * t) * Math.sin(16 * t) : 0;
	});
	const ring = (): void => {
		rungAt.current = clock.elapsedTime;
		ringBell();
	};
	return (
		<Clickable onSelect={ring}>
			{/* Generous invisible hit area: the bell itself is small from the isometric camera. */}
			<mesh position={[0, -0.12, 0.2]}>
				<boxGeometry args={[0.7, 0.8, 0.4]} />
				<meshBasicMaterial transparent opacity={0} depthWrite={false} />
			</mesh>
			<Block size={[0.1, 0.05, 0.02]} position={[0, 0.24, 0.01]} color={PALETTE.bellMustard} />
			<Block
				size={[0.024, 0.024, hangZ]}
				position={[0, 0.24, hangZ / 2]}
				color={PALETTE.bellMustard}
			/>
			<group ref={bell} position={[0, 0.24, hangZ]}>
				<group position={[0, -0.2, 0]}>
					<Cylinder
						radiusTop={0.012}
						height={0.14}
						segments={6}
						position={[0, 0.13, 0]}
						{...brass}
					/>
					<Ball radius={0.065} segments={10} position={[0, 0.045, 0]} {...brass} />
					<Cylinder
						radiusTop={0.065}
						radiusBottom={0.14}
						height={0.18}
						segments={12}
						position={[0, -0.04, 0]}
						{...brass}
					/>
					<Cylinder
						radiusTop={0.15}
						height={0.025}
						segments={12}
						position={[0, -0.13, 0]}
						{...brass}
					/>
					<Ball radius={0.032} segments={8} position={[0, -0.165, 0]} {...brass} />
				</group>
			</group>
			{label ? (
				<Text
					font={FONTS.monoBold}
					fontSize={0.07}
					letterSpacing={0.2}
					color="#a08b68"
					anchorX="center"
					anchorY="top"
					position={[0, -0.28, 0.004]}
				>
					{label.toUpperCase()}
				</Text>
			) : null}
		</Clickable>
	);
}

/** Current local time, refreshed often enough for a minute hand. */
function useWallTime(): Date {
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const id = window.setInterval(() => setNow(new Date()), 15_000);
		return () => window.clearInterval(id);
	}, []);
	return now;
}

function Hand(props: { readonly turns: number; readonly length: number; readonly z: number }) {
	const width = props.length > 0.2 ? 0.018 : 0.028;
	return (
		<group rotation={[0, 0, -props.turns * TAU]} position={[0, 0, props.z]}>
			<Block
				size={[width, props.length, 0.008]}
				position={[0, props.length / 2 - 0.03, 0]}
				color={PALETTE.charcoal}
				noShadow
			/>
		</group>
	);
}

/** Only the quarter hours get a mark; the reference face is otherwise bare. */
const TICKS = [0, 3, 6, 9] as const;

/** Round wall clock (cream face, thin wood rim) showing the local time. */
export function WallClock() {
	const now = useWallTime();
	const minutes = (now.getMinutes() + now.getSeconds() / 60) / 60;
	const hours = ((now.getHours() % 12) + minutes) / 12;
	return (
		<group>
			<Cylinder
				radiusTop={0.32}
				height={0.06}
				segments={16}
				rotation={FACE_FORWARD}
				position={[0, 0, 0.03]}
				color={PALETTE.clockRim}
			/>
			<Cylinder
				radiusTop={0.29}
				height={0.012}
				segments={16}
				rotation={FACE_FORWARD}
				position={[0, 0, 0.064]}
				color={PALETTE.clockFace}
			/>
			{TICKS.map((tick) => (
				<group key={tick} rotation={[0, 0, (tick / 12) * TAU]}>
					<Block
						size={[0.022, 0.045, 0.006]}
						position={[0, 0.235, 0.072]}
						color={PALETTE.clockRim}
						noShadow
					/>
				</group>
			))}
			<Hand turns={hours} length={0.17} z={0.076} />
			<Hand turns={minutes} length={0.24} z={0.084} />
			<Cylinder
				radiusTop={0.022}
				height={0.02}
				segments={10}
				rotation={FACE_FORWARD}
				position={[0, 0, 0.088]}
				color={PALETTE.charcoal}
				noShadow
			/>
		</group>
	);
}
