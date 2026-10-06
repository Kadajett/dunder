import { Text } from "@react-three/drei";
import { useEffect, useState } from "react";
import { FONTS } from "../fonts";
import { PALETTE } from "./palette";
import { Ball, Block, Cylinder } from "./parts";
import type { DecorProps } from "./props";

// Wall-mounted kinds: centred on the local origin, back plane at z = 0, protruding toward +z.

const FACE_FORWARD: [number, number, number] = [Math.PI / 2, 0, 0];
const TAU = Math.PI * 2;

/** Brass bell hanging from a wooden wall bracket; `label` is painted on the wall beneath. */
export function WallBell({ label }: DecorProps) {
	const brass = { color: PALETTE.brass, metalness: 0.55, roughness: 0.35 } as const;
	const hangZ = 0.3;
	return (
		<group>
			<Block size={[0.26, 0.4, 0.04]} position={[0, 0, 0.02]} color={PALETTE.woodDark} />
			<Block size={[0.05, 0.05, 0.3]} position={[0, 0.14, 0.19]} color={PALETTE.woodDark} />
			<Block size={[0.04, 0.12, 0.04]} position={[0, 0.06, 0.06]} color={PALETTE.woodDark} />
			<group position={[0, 0, hangZ]}>
				<Cylinder radiusTop={0.012} height={0.06} segments={6} position={[0, 0.09, 0]} {...brass} />
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
			{label ? (
				<Text
					font={FONTS.monoBold}
					fontSize={0.07}
					letterSpacing={0.2}
					color="#7d6a4c"
					anchorX="center"
					anchorY="top"
					position={[0, -0.28, 0.004]}
				>
					{label.toUpperCase()}
				</Text>
			) : null}
		</group>
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

const TICKS = Array.from({ length: 12 }, (_, i) => i);

/** Round wall clock (white face, dark rim) showing the local time. */
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
				color={PALETTE.charcoal}
			/>
			<Cylinder
				radiusTop={0.27}
				height={0.012}
				segments={16}
				rotation={FACE_FORWARD}
				position={[0, 0, 0.064]}
				color={PALETTE.paper}
			/>
			{TICKS.map((tick) => {
				const major = tick % 3 === 0;
				return (
					<group key={tick} rotation={[0, 0, (tick / 12) * TAU]}>
						<Block
							size={[major ? 0.03 : 0.016, major ? 0.06 : 0.035, 0.006]}
							position={[0, 0.22, 0.072]}
							color={PALETTE.charcoal}
							noShadow
						/>
					</group>
				);
			})}
			<Hand turns={hours} length={0.17} z={0.076} />
			<Hand turns={minutes} length={0.24} z={0.084} />
			<Cylinder
				radiusTop={0.022}
				height={0.02}
				segments={10}
				rotation={FACE_FORWARD}
				position={[0, 0, 0.088]}
				color={PALETTE.brass}
				noShadow
			/>
		</group>
	);
}

const REVENUE_DEFAULT = "REVENUE · JULY";
const TEXT_Z = 0.064;

/**
 * Dark wall panel ≈ 2.2 × 1.2. `label` line 1 is the headline; optional extra lines
 * (newline-separated) set the big figure and the mono detail lines under it.
 */
export function RevenueBoard({ label }: DecorProps) {
	const [headline = REVENUE_DEFAULT, figure = "€0", ...details] = (label ?? REVENUE_DEFAULT).split(
		"\n",
	);
	const lines = details.length > 0 ? details : ["pipeline · closing this month"];
	return (
		<group>
			<Block size={[2.2, 1.2, 0.05]} position={[0, 0, 0.025]} color={PALETTE.charcoal} />
			<Block size={[2.06, 1.06, 0.01]} position={[0, 0, 0.055]} color="#353a42" />
			<Text
				font={FONTS.monoBold}
				fontSize={0.1}
				letterSpacing={0.25}
				color={PALETTE.cream}
				anchorX="center"
				anchorY="middle"
				position={[0, 0.36, TEXT_Z]}
			>
				{headline}
			</Text>
			<Text
				font={FONTS.display}
				fontSize={0.36}
				color={PALETTE.ledGreen}
				anchorX="center"
				anchorY="middle"
				position={[0, 0.02, TEXT_Z]}
			>
				{figure}
			</Text>
			{lines.slice(0, 3).map((line, row) => (
				<Text
					key={line}
					font={FONTS.mono}
					fontSize={0.075}
					letterSpacing={0.05}
					color="#9aa3ad"
					anchorX="center"
					anchorY="middle"
					position={[0, -0.3 - row * 0.12, TEXT_Z]}
				>
					{line}
				</Text>
			))}
		</group>
	);
}
