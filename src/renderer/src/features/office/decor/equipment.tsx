import { PALETTE } from "./palette";
import { Block, Cylinder } from "./parts";

const RACK_W = 0.7;
const RACK_H = 1.9;
const RACK_UNITS = Array.from({ length: 9 }, (_, i) => i);

/** One rack unit: a slotted face plate with a couple of status LEDs. */
function RackUnit({ index }: { readonly index: number }) {
	const pitch = (RACK_H - 0.3) / RACK_UNITS.length;
	const y = 0.16 + pitch * (index + 0.5);
	const front = RACK_W / 2 + 0.012;
	const leds = index % 3 === 0 ? 3 : 2;
	return (
		<group position={[0, y, front]}>
			<Block size={[RACK_W - 0.12, pitch - 0.035, 0.02]} color={PALETTE.charcoalLight} />
			<Block size={[0.3, 0.012, 0.005]} position={[-0.08, 0, 0.012]} color="#1d2025" noShadow />
			{Array.from({ length: leds }, (_, i) => {
				const x = 0.16 + i * 0.05;
				const glow = (index + i) % 4 === 0 ? PALETTE.ledTeal : PALETTE.ledGreen;
				return (
					<Block
						key={x}
						size={[0.034, 0.034, 0.01]}
						position={[x, 0, 0.014]}
						color={glow}
						emissive={glow}
						emissiveIntensity={1.4}
						noShadow
					/>
				);
			})}
		</group>
	);
}

/** Charcoal server rack 0.7 × 0.7 × 1.9 with glowing green/teal LEDs. */
export function ServerRack() {
	return (
		<group>
			<Block
				size={[RACK_W, RACK_H - 0.04, RACK_W]}
				position={[0, 0.04 + (RACK_H - 0.04) / 2, 0]}
				color={PALETTE.charcoal}
			/>
			<Block size={[RACK_W - 0.06, 0.04, RACK_W - 0.06]} position={[0, 0.02, 0]} color="#1d2025" />
			{RACK_UNITS.map((index) => (
				<RackUnit key={index} index={index} />
			))}
			{[0.5, 1.0, 1.5].map((y) => (
				<Block
					key={y}
					size={[0.006, 0.18, 0.4]}
					position={[RACK_W / 2 + 0.003, y, 0]}
					color="#1d2025"
					noShadow
				/>
			))}
		</group>
	);
}

/** Floor-standing office printer/copier on its paper-drawer cabinet. */
export function Printer() {
	const w = 0.72;
	const d = 0.6;
	return (
		<group>
			<Block size={[w, 0.62, d]} position={[0, 0.31, 0]} color={PALETTE.plastic} />
			{[0.2, 0.44].map((y) => (
				<Block
					key={y}
					size={[w - 0.08, 0.012, 0.01]}
					position={[0, y, d / 2 + 0.005]}
					color={PALETTE.plasticDark}
					noShadow
				/>
			))}
			<Block size={[w, 0.3, d]} position={[0, 0.77, 0]} color={PALETTE.plasticDark} />
			<Block size={[w - 0.12, 0.05, d - 0.16]} position={[0, 0.645, 0.06]} color="#ece9e2" />
			<Block size={[0.22, 0.015, 0.3]} position={[0, 0.678, 0.08]} color={PALETTE.paper} noShadow />
			<Block size={[w, 0.06, d]} position={[0, 0.95, 0]} color={PALETTE.plastic} />
			<Block
				size={[0.26, 0.04, 0.14]}
				position={[0.2, 0.92, d / 2 + 0.04]}
				rotation={[0.35, 0, 0]}
				color={PALETTE.charcoal}
			/>
			<Block
				size={[0.12, 0.004, 0.06]}
				position={[0.18, 0.944, d / 2 + 0.05]}
				rotation={[0.35, 0, 0]}
				color={PALETTE.ledTeal}
				emissive={PALETTE.ledTeal}
				emissiveIntensity={0.6}
				noShadow
			/>
		</group>
	);
}

/** Office water cooler: white cabinet, blue bottle, red/blue taps on the front. */
export function WaterCooler() {
	const half = 0.2;
	return (
		<group>
			<Block size={[0.4, 0.95, 0.4]} position={[0, 0.475, 0]} color={PALETTE.paper} />
			<Block
				size={[0.3, 0.22, 0.02]}
				position={[0, 0.6, half + 0.01]}
				color={PALETTE.plasticDark}
			/>
			<Block size={[0.26, 0.03, 0.08]} position={[0, 0.5, half + 0.04]} color={PALETTE.charcoal} />
			{[
				{ x: -0.07, color: "#c9504a" },
				{ x: 0.07, color: "#4a7fc9" },
			].map((tap) => (
				<Block
					key={tap.x}
					size={[0.04, 0.05, 0.05]}
					position={[tap.x, 0.66, half + 0.035]}
					color={tap.color}
				/>
			))}
			<Cylinder radiusTop={0.06} height={0.06} position={[0, 0.98, 0]} color="#8cc4e0" />
			<Cylinder
				radiusTop={0.15}
				height={0.38}
				segments={12}
				position={[0, 1.2, 0]}
				color="#8cc4e0"
				opacity={0.75}
				roughness={0.25}
			/>
			<Cylinder
				radiusTop={0.1}
				radiusBottom={0.15}
				height={0.06}
				segments={12}
				position={[0, 1.42, 0]}
				color="#8cc4e0"
				opacity={0.75}
			/>
		</group>
	);
}

/** Brass floor lamp with a warm, glowing cream shade. */
export function FloorLamp() {
	return (
		<group>
			<Cylinder
				radiusTop={0.16}
				radiusBottom={0.2}
				height={0.05}
				segments={12}
				position={[0, 0.025, 0]}
				color={PALETTE.charcoal}
			/>
			<Cylinder
				radiusTop={0.02}
				height={1.4}
				segments={6}
				position={[0, 0.75, 0]}
				color={PALETTE.brass}
				metalness={0.5}
				roughness={0.4}
			/>
			<Cylinder
				radiusTop={0.15}
				radiusBottom={0.25}
				height={0.3}
				segments={10}
				position={[0, 1.55, 0]}
				color="#f1e3c4"
				emissive="#ffd59a"
				emissiveIntensity={0.45}
			/>
			<pointLight position={[0, 1.4, 0]} color="#ffd59a" intensity={1.2} distance={3} decay={2} />
		</group>
	);
}
