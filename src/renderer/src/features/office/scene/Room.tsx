import { Text } from "@react-three/drei";
import type { Room as RoomSpec, WindowSpec } from "@shared/layout/schema";
import { useMemo } from "react";
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";
import { FONTS } from "../fonts";

const WALL_THICKNESS = 0.3;
const FLOOR_THICKNESS = 0.45;
/**
 * How much of the wall paint is self-lit (see `wallPaint` in Room). Above 1 because ACES
 * tone mapping compresses highlights: this lands the paint near the reference's #fbf8f1.
 */
const WALL_GLOW = 1.6;
const FRAME_COLOR = "#ece2cc";
const SILL_COLOR = "#e2d5bb";
const TRIM_COLOR = "#ddcfb3";

/** Unlit daylight glass: pale sky at the top fading to a hazy horizon, like the reference. */
function useSkyTexture(): CanvasTexture {
	return useMemo(() => {
		const canvas = document.createElement("canvas");
		canvas.width = 4;
		canvas.height = 64;
		const context = canvas.getContext("2d");
		if (context) {
			const sky = context.createLinearGradient(0, 0, 0, 64);
			sky.addColorStop(0, "#bcd8ea");
			sky.addColorStop(0.65, "#d6e7f1");
			sky.addColorStop(1, "#e8f1f3");
			context.fillStyle = sky;
			context.fillRect(0, 0, 4, 64);
		}
		const texture = new CanvasTexture(canvas);
		texture.colorSpace = SRGBColorSpace;
		return texture;
	}, []);
}

/** Wall paint with a faint darkening toward the floor, a cheap stand-in for ambient occlusion. */
function useWallTexture(): CanvasTexture {
	return useMemo(() => {
		const canvas = document.createElement("canvas");
		canvas.width = 4;
		canvas.height = 64;
		const context = canvas.getContext("2d");
		if (context) {
			const shade = context.createLinearGradient(0, 0, 0, 64);
			shade.addColorStop(0, "#ffffff");
			shade.addColorStop(0.7, "#fbf9f6");
			shade.addColorStop(1, "#ebe6de");
			context.fillStyle = shade;
			context.fillRect(0, 0, 4, 64);
		}
		const texture = new CanvasTexture(canvas);
		texture.colorSpace = SRGBColorSpace;
		return texture;
	}, []);
}

/** Warm plank floor painted once into a small repeating texture. */
function usePlankTexture(color: string, width: number, depth: number): CanvasTexture {
	return useMemo(() => {
		const canvas = document.createElement("canvas");
		canvas.width = 256;
		canvas.height = 256;
		const context = canvas.getContext("2d");
		if (context) {
			context.fillStyle = color;
			context.fillRect(0, 0, 256, 256);
			for (let row = 0; row < 8; row += 1) {
				const shade = row % 2 === 0 ? "rgba(255,248,232,0.03)" : "rgba(80,64,40,0.025)";
				context.fillStyle = shade;
				context.fillRect(0, row * 32, 256, 32);
				context.fillStyle = "rgba(80,64,40,0.05)";
				context.fillRect(0, row * 32, 256, 1);
				const seam = (row * 97) % 256;
				context.fillRect(seam, row * 32, 1, 32);
			}
		}
		const texture = new CanvasTexture(canvas);
		texture.colorSpace = SRGBColorSpace;
		texture.wrapS = RepeatWrapping;
		texture.wrapT = RepeatWrapping;
		texture.repeat.set(width / 4, depth / 4);
		texture.anisotropy = 8;
		return texture;
	}, [color, width, depth]);
}

/** Window centre, rotation and facing for a window on the left or right wall. */
function windowPlacement(spec: WindowSpec, room: RoomSpec) {
	const y = spec.sill + spec.height / 2;
	if (spec.wall === "left") {
		return {
			position: [-room.width / 2, y, -room.depth / 2 + spec.offset] as const,
			rotationY: Math.PI / 2,
		};
	}
	return { position: [-room.width / 2 + spec.offset, y, -room.depth / 2] as const, rotationY: 0 };
}

function WallWindow({
	spec,
	room,
	sky,
}: {
	readonly spec: WindowSpec;
	readonly room: RoomSpec;
	readonly sky: CanvasTexture;
}) {
	const { position, rotationY } = windowPlacement(spec, room);
	const panes = Math.max(1, Math.round(spec.width / 1.6));
	const frame = 0.12;
	return (
		<group position={position} rotation={[0, rotationY, 0]}>
			{/* Deep cream casing: four bars around the glass so the window reads as set into the wall. */}
			{[1, -1].map((side) => (
				<mesh key={`rail-${side}`} position={[0, (side * (spec.height + frame)) / 2, 0.07]}>
					<boxGeometry args={[spec.width + frame * 2, frame, 0.14]} />
					<meshStandardMaterial color={FRAME_COLOR} flatShading />
				</mesh>
			))}
			{[1, -1].map((side) => (
				<mesh key={`stile-${side}`} position={[(side * (spec.width + frame)) / 2, 0, 0.07]}>
					<boxGeometry args={[frame, spec.height, 0.14]} />
					<meshStandardMaterial color={FRAME_COLOR} flatShading />
				</mesh>
			))}
			<mesh position={[0, 0, 0.01]}>
				<planeGeometry args={[spec.width, spec.height]} />
				<meshBasicMaterial map={sky} toneMapped={false} />
			</mesh>
			{Array.from({ length: panes - 1 }, (_, index) => {
				const x = -spec.width / 2 + (spec.width / panes) * (index + 1);
				return (
					<mesh key={`mullion-${x.toFixed(3)}`} position={[x, 0, 0.04]}>
						<boxGeometry args={[0.05, spec.height, 0.05]} />
						<meshStandardMaterial color={FRAME_COLOR} flatShading />
					</mesh>
				);
			})}
			<mesh position={[0, -spec.height / 2 - frame - 0.03, 0.12]} castShadow>
				<boxGeometry args={[spec.width + 0.46, 0.06, 0.24]} />
				<meshStandardMaterial color={SILL_COLOR} flatShading />
			</mesh>
		</group>
	);
}

function CompanySign({ room }: { readonly room: RoomSpec }) {
	const x = -room.width / 2 + room.sign.offset;
	const z = -room.depth / 2 + 0.02;
	return (
		<group position={[x, 0, z]}>
			<Text
				font={FONTS.display}
				fontSize={1.05}
				letterSpacing={0.16}
				color="#8f7a5c"
				anchorX="center"
				anchorY="middle"
				position={[0, 3.3, 0]}
			>
				{room.sign.title}
			</Text>
			<Text
				font={FONTS.monoBold}
				fontSize={0.26}
				letterSpacing={0.24}
				color="#9c8767"
				anchorX="center"
				anchorY="middle"
				position={[0, 2.62, 0]}
			>
				{room.sign.subtitle}
			</Text>
		</group>
	);
}

/** Floor slab, the two back walls with baseboards, cap trim and windows, and the company sign. */
export function Room({ room }: { readonly room: RoomSpec }) {
	const planks = usePlankTexture(room.floorColor, room.width, room.depth);
	const sky = useSkyTexture();
	const wallShade = useWallTexture();
	// The sun barely reaches the two back walls, so lit alone they read grey-beige. A share of
	// their own paint as emission keeps them the near-white cream of the reference without
	// brightening the floor; the shade map still darkens them toward the baseboard.
	const wallPaint = {
		color: room.wallColor,
		map: wallShade,
		emissive: room.wallColor,
		emissiveMap: wallShade,
		emissiveIntensity: WALL_GLOW,
		roughness: 0.95,
	} as const;
	const { width, depth, wallHeight: height } = room;
	const t = WALL_THICKNESS;
	// The wall boxes span from the slab's underside to `height`; the cap trim sits on top.
	return (
		<group>
			<mesh position={[0, -FLOOR_THICKNESS / 2, 0]} receiveShadow>
				<boxGeometry args={[width, FLOOR_THICKNESS, depth]} />
				<meshStandardMaterial map={planks} roughness={0.9} />
			</mesh>
			<mesh
				position={[-width / 2 - t / 2, height / 2 - FLOOR_THICKNESS / 2, -t / 2]}
				receiveShadow
				castShadow
			>
				<boxGeometry args={[t, height + FLOOR_THICKNESS, depth + t]} />
				<meshStandardMaterial {...wallPaint} />
			</mesh>
			<mesh
				position={[-t / 2, height / 2 - FLOOR_THICKNESS / 2, -depth / 2 - t / 2]}
				receiveShadow
				castShadow
			>
				<boxGeometry args={[width + t, height + FLOOR_THICKNESS, t]} />
				<meshStandardMaterial {...wallPaint} />
			</mesh>
			<mesh position={[-width / 2 - t / 2, height + 0.03, -t / 2]}>
				<boxGeometry args={[t + 0.06, 0.06, depth + t + 0.06]} />
				<meshStandardMaterial color={TRIM_COLOR} flatShading />
			</mesh>
			<mesh position={[-t / 2, height + 0.03, -depth / 2 - t / 2]}>
				<boxGeometry args={[width + t + 0.06, 0.06, t + 0.06]} />
				<meshStandardMaterial color={TRIM_COLOR} flatShading />
			</mesh>
			<mesh position={[-width / 2 + 0.04, 0.08, 0]}>
				<boxGeometry args={[0.08, 0.16, depth]} />
				<meshStandardMaterial color={TRIM_COLOR} flatShading />
			</mesh>
			<mesh position={[0, 0.08, -depth / 2 + 0.04]}>
				<boxGeometry args={[width, 0.16, 0.08]} />
				<meshStandardMaterial color={TRIM_COLOR} flatShading />
			</mesh>
			{room.windows.map((spec) => (
				<WallWindow key={`${spec.wall}-${spec.offset}`} spec={spec} room={room} sky={sky} />
			))}
			<CompanySign room={room} />
		</group>
	);
}
