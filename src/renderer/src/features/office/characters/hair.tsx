import type { HairStyle } from "@shared/avatar/style";
import type { BufferGeometry } from "three";
import { GEO, HEAD_R } from "./geometry";
import { Part } from "./Part";

type Vec3 = [number, number, number];
interface Placement {
	position: Vec3;
	rotation: Vec3;
}

/**
 * Point on the head sphere at `polar` radians from the crown and `azimuth`
 * radians around y (0 = front, +z), with the rotation that turns local +y outward.
 */
function onHead(polar: number, azimuth: number, radius: number): Placement {
	const nx = Math.sin(polar) * Math.sin(azimuth);
	const ny = Math.cos(polar);
	const nz = Math.sin(polar) * Math.cos(azimuth);
	return {
		position: [nx * radius, ny * radius, nz * radius],
		rotation: [Math.atan2(nz, ny), 0, -Math.asin(nx)],
	};
}

const SPIKES = [
	[0.1, 0],
	[0.55, 0.15],
	[0.55, 1.2],
	[0.55, -1.1],
	[0.75, 2.2],
	[0.75, -2.3],
	[0.6, Math.PI],
	[0.95, 1.75],
	[0.95, -1.7],
].map(([polar = 0, azimuth = 0]) => onHead(polar, azimuth, HEAD_R + 0.04));

const MOHAWK = [0.65, 0.2, -0.25, -0.7, -1.15].map((polar) => onHead(polar, 0, HEAD_R + 0.035));

const CURLS = [
	onHead(0, 0, HEAD_R),
	...[0, 1, 2, 3, 4, 5].map((k) => onHead(0.45, (k * Math.PI) / 3 + 0.3, HEAD_R)),
	...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => onHead(0.88, (k * Math.PI) / 4, HEAD_R)),
	...[-1.5, -0.75, 0, 0.75, 1.5].map((a) => onHead(1.25, Math.PI + a, HEAD_R)),
];

interface HairProps {
	style: HairStyle;
	color: string;
}

function Cap({ color, tilt = -0.35 }: { color: string; tilt?: number }) {
	return <Part geometry={GEO.hairCap} color={color} rotation={[tilt, 0, 0]} doubleSided />;
}

function Buzz({ color }: { color: string }) {
	return <Part geometry={GEO.buzzCap} color={color} rotation={[-0.28, 0, 0]} doubleSided />;
}

function Placed({
	items,
	color,
	geometry,
}: {
	items: Placement[];
	color: string;
	geometry: BufferGeometry;
}) {
	return (
		<>
			{items.map((item) => (
				<Part
					key={item.position.join()}
					geometry={geometry}
					color={color}
					position={item.position}
					rotation={item.rotation}
				/>
			))}
		</>
	);
}

function LongHair({ color, shell }: { color: string; shell: typeof GEO.bobShell }) {
	return (
		<>
			<Cap color={color} tilt={-0.25} />
			<Part geometry={shell} color={color} doubleSided />
			{shell === GEO.longShell ? (
				<>
					<Part
						geometry={GEO.panel}
						color={color}
						position={[0, -0.2, -0.13]}
						rotation={[-0.12, 0, 0]}
						scale={[0.34, 0.34, 0.1]}
					/>
					{([1, -1] as const).map((side) => (
						<Part
							key={side}
							geometry={GEO.strand}
							color={color}
							position={[side * 0.19, -0.2, 0.0]}
						/>
					))}
				</>
			) : null}
		</>
	);
}

/** Hairstyle in skull space. Volume sits on the crown and front so it reads from above. */
export function Hair({ style, color }: HairProps) {
	switch (style) {
		case "short":
			return <Cap color={color} />;
		case "buzz":
			return <Buzz color={color} />;
		case "bald":
			return <Part geometry={GEO.baldRing} color={color} doubleSided />;
		case "afro":
			return <Part geometry={GEO.afro} color={color} position={[0, 0.11, -0.09]} />;
		case "bob":
			return <LongHair color={color} shell={GEO.bobShell} />;
		case "long":
			return <LongHair color={color} shell={GEO.longShell} />;
		case "spiky":
			return (
				<>
					<Cap color={color} />
					<Placed items={SPIKES} color={color} geometry={GEO.spike} />
				</>
			);
		case "mohawk":
			return (
				<>
					<Buzz color={color} />
					<Placed items={MOHAWK} color={color} geometry={GEO.spike} />
				</>
			);
		case "curly":
			return (
				<>
					<Buzz color={color} />
					<Placed items={CURLS} color={color} geometry={GEO.curl} />
				</>
			);
		case "bun":
			return (
				<>
					<Cap color={color} />
					<Part geometry={GEO.bun} color={color} position={[0, 0.24, -0.1]} />
				</>
			);
		case "ponytail":
			return (
				<>
					<Cap color={color} />
					<Part geometry={GEO.curl} color={color} position={[0, 0.05, -0.23]} scale={0.8} />
					<Part
						geometry={GEO.tail}
						color={color}
						position={[0, -0.09, -0.29]}
						rotation={[0.4, 0, 0]}
					/>
				</>
			);
		case "sidePart":
			return (
				<>
					<Cap color={color} />
					<Part
						geometry={GEO.swoop}
						color={color}
						position={[0.07, 0.19, 0.11]}
						rotation={[0.5, 0, -0.35]}
						scale={[1.35, 0.5, 0.95]}
					/>
				</>
			);
	}
}
