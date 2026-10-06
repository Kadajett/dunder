import { Text } from "@react-three/drei";
import type { Room as RoomSpec, WindowSpec } from "@shared/layout/schema";
import { useMemo } from "react";
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";
import { FONTS } from "../fonts";

const WALL_THICKNESS = 0.3;
const FLOOR_THICKNESS = 0.45;

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
				const shade = row % 2 === 0 ? "rgba(255,240,215,0.06)" : "rgba(90,60,30,0.05)";
				context.fillStyle = shade;
				context.fillRect(0, row * 32, 256, 32);
				context.fillStyle = "rgba(90,60,30,0.16)";
				context.fillRect(0, row * 32, 256, 1.5);
				const seam = (row * 97) % 256;
				context.fillRect(seam, row * 32, 1.5, 32);
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

function WallWindow({ spec, room }: { readonly spec: WindowSpec; readonly room: RoomSpec }) {
	const { position, rotationY } = windowPlacement(spec, room);
	const panes = Math.max(2, Math.round(spec.width / 1.1));
	return (
		<group position={position} rotation={[0, rotationY, 0]}>
			<mesh position={[0, 0, 0.03]} receiveShadow>
				<boxGeometry args={[spec.width + 0.22, spec.height + 0.22, 0.06]} />
				<meshStandardMaterial color="#e6d3b0" flatShading />
			</mesh>
			<mesh position={[0, 0, 0.065]}>
				<boxGeometry args={[spec.width, spec.height, 0.02]} />
				<meshStandardMaterial
					color="#cfe4ee"
					emissive="#bcd9e8"
					emissiveIntensity={0.35}
					roughness={0.2}
				/>
			</mesh>
			{Array.from({ length: panes - 1 }, (_, index) => {
				const x = -spec.width / 2 + (spec.width / panes) * (index + 1);
				return (
					<mesh key={`mullion-${x.toFixed(3)}`} position={[x, 0, 0.08]}>
						<boxGeometry args={[0.06, spec.height, 0.03]} />
						<meshStandardMaterial color="#e6d3b0" flatShading />
					</mesh>
				);
			})}
			<mesh position={[0, -spec.height / 2 - 0.12, 0.1]} castShadow>
				<boxGeometry args={[spec.width + 0.4, 0.06, 0.16]} />
				<meshStandardMaterial color="#d9c29c" flatShading />
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

/** Floor slab, the two back walls with baseboards and windows, and the company sign. */
export function Room({ room }: { readonly room: RoomSpec }) {
	const planks = usePlankTexture(room.floorColor, room.width, room.depth);
	const { width, depth, wallHeight: height } = room;
	const t = WALL_THICKNESS;
	return (
		<group>
			<mesh position={[0, -FLOOR_THICKNESS / 2, 0]} receiveShadow>
				<boxGeometry args={[width, FLOOR_THICKNESS, depth]} />
				<meshStandardMaterial map={planks} roughness={0.85} />
			</mesh>
			<mesh
				position={[-width / 2 - t / 2, height / 2 - FLOOR_THICKNESS / 2, -t / 2]}
				receiveShadow
				castShadow
			>
				<boxGeometry args={[t, height + FLOOR_THICKNESS, depth + t]} />
				<meshStandardMaterial color={room.wallColor} roughness={0.95} />
			</mesh>
			<mesh
				position={[-t / 2, height / 2 - FLOOR_THICKNESS / 2, -depth / 2 - t / 2]}
				receiveShadow
				castShadow
			>
				<boxGeometry args={[width + t, height + FLOOR_THICKNESS, t]} />
				<meshStandardMaterial color={room.wallColor} roughness={0.95} />
			</mesh>
			<mesh position={[-width / 2 + 0.04, 0.08, 0]}>
				<boxGeometry args={[0.08, 0.16, depth]} />
				<meshStandardMaterial color="#d8c19c" flatShading />
			</mesh>
			<mesh position={[0, 0.08, -depth / 2 + 0.04]}>
				<boxGeometry args={[width, 0.16, 0.08]} />
				<meshStandardMaterial color="#d8c19c" flatShading />
			</mesh>
			{room.windows.map((spec) => (
				<WallWindow key={`${spec.wall}-${spec.offset}`} spec={spec} room={room} />
			))}
			<CompanySign room={room} />
		</group>
	);
}
