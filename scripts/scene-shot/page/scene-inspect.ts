import { _roots, type RootState } from "@react-three/fiber";
import { Mesh, Vector3 } from "three";

export function rootState(): RootState | undefined {
	const canvas = document.querySelector("canvas");
	return canvas ? _roots.get(canvas)?.store.getState() : undefined;
}

export interface MeshCounts {
	meshes: number;
	casters: number;
	instanced: number;
}

/** Mesh counts per top-level scene child, with shadow casters. */
export function sceneStats(): Record<string, MeshCounts> {
	const out: Record<string, MeshCounts> = {};
	for (const child of rootState()?.scene.children ?? []) {
		const entry: MeshCounts = { meshes: 0, casters: 0, instanced: 0 };
		child.traverse((object) => {
			if (!(object instanceof Mesh)) return;
			entry.meshes += 1;
			if (object.castShadow) entry.casters += 1;
			if ("isInstancedMesh" in object) entry.instanced += 1;
		});
		out[`${child.type}:${child.name || child.uuid.slice(0, 4)}`] = entry;
	}
	return out;
}

export interface ScreenPoint {
	readonly x: number;
	readonly y: number;
	readonly type: string;
}

/** CSS-pixel canvas positions of every object marked `userData.dynamic` (hover targets). */
export function dynamicTargets(): ScreenPoint[] {
	const state = rootState();
	if (!state) return [];
	const out: ScreenPoint[] = [];
	state.scene.traverse((object) => {
		if (object.userData["dynamic"] !== true) return;
		const v = object.getWorldPosition(new Vector3()).project(state.camera);
		out.push({
			x: ((v.x + 1) / 2) * state.size.width,
			y: ((1 - v.y) / 2) * state.size.height,
			type: object.type,
		});
	});
	return out;
}

function offscreenCanvasOf(object: unknown): OffscreenCanvas | null {
	if (!(object instanceof Mesh)) return null;
	const material: unknown = object.material;
	const map = material && typeof material === "object" && "map" in material ? material.map : null;
	const image = map && typeof map === "object" && "image" in map ? map.image : null;
	return image instanceof OffscreenCanvas ? image : null;
}

/** PNG data URLs of the terminal screen textures currently mapped onto monitors. */
export async function screenTextures(): Promise<string[]> {
	const canvases: OffscreenCanvas[] = [];
	rootState()?.scene.traverse((object) => {
		const canvas = offscreenCanvasOf(object);
		if (canvas && !canvases.includes(canvas)) canvases.push(canvas);
	});
	return Promise.all(
		canvases.map(async (canvas) => {
			const bytes = new Uint8Array(await (await canvas.convertToBlob()).arrayBuffer());
			return `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`;
		}),
	);
}
