import {
	Box3,
	BoxGeometry,
	Group,
	InstancedMesh,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	Vector3,
} from "three";
import { describe, expect, it } from "vitest";
import { bakeStaticBatch, DYNAMIC } from "./StaticBatch";

function box(color: string, x: number, castShadow = true): Mesh {
	const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color }));
	mesh.position.x = x;
	mesh.castShadow = castShadow;
	return mesh;
}

function scene(): { source: Group; target: Group; root: Group } {
	const root = new Group();
	root.position.set(100, 0, 0);
	const source = new Group();
	const target = new Group();
	root.add(source, target);
	return { source, target, root };
}

describe("bakeStaticBatch", () => {
	it("merges meshes with identical material and shadow settings into one mesh each", () => {
		const { source, target } = scene();
		source.add(box("#ff0000", 0), box("#ff0000", 4), box("#00ff00", 8), box("#ff0000", 12, false));
		bakeStaticBatch(source, target);

		expect(target.children).toHaveLength(3);
		const vertexCounts = target.children
			.map((mesh) => (mesh as Mesh).geometry.attributes["position"]?.count ?? 0)
			.sort((a, b) => a - b);
		expect(vertexCounts).toEqual([24, 24, 48]);
		for (const child of source.children) expect(child.visible).toBe(false);
	});

	it("positions the merged geometry in the target's space, independent of the common parent", () => {
		const { source, target } = scene();
		const nested = new Group();
		nested.position.z = 3;
		nested.add(box("#ff0000", 5));
		source.add(nested);
		bakeStaticBatch(source, target);

		const merged = target.children[0] as Mesh;
		const center = new Box3()
			.setFromBufferAttribute(merged.geometry.getAttribute("position") as never)
			.getCenter(new Vector3());
		expect(center.x).toBeCloseTo(5);
		expect(center.z).toBeCloseTo(3);
		expect(merged.castShadow).toBe(true);
	});

	it("leaves dynamic subtrees, instanced and non-standard meshes alone", () => {
		const { source, target } = scene();
		const hover = box("#ff0000", 0);
		hover.userData = { ...DYNAMIC };
		const swinging = new Group();
		swinging.userData = { ...DYNAMIC };
		swinging.add(box("#ff0000", 1));
		const instanced = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial(), 2);
		const screen = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
		source.add(hover, swinging, instanced, screen, box("#ff0000", 2));
		bakeStaticBatch(source, target);

		expect(target.children).toHaveLength(1);
		expect(hover.visible).toBe(true);
		expect(swinging.children[0]?.visible).toBe(true);
		expect(instanced.visible).toBe(true);
		expect(screen.visible).toBe(true);
	});

	it("undo restores the originals and removes the merged meshes", () => {
		const { source, target } = scene();
		source.add(box("#ff0000", 0), box("#0000ff", 2));
		const undo = bakeStaticBatch(source, target);
		expect(target.children).toHaveLength(2);
		undo();
		expect(target.children).toHaveLength(0);
		for (const child of source.children) expect(child.visible).toBe(true);
	});
});
