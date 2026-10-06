import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT } from "./default-layout";
import {
	addDecor,
	addDesk,
	addLabel,
	addZone,
	deleteItem,
	freshId,
	itemPosition,
	moveItem,
	rotateItem,
} from "./ops";
import { claimDesks, updateDecor, updateDesk, updateZone } from "./ops-update";
import { type Layout, layoutSchema } from "./schema";

const layout = DEFAULT_LAYOUT;
const valid = (next: Layout) => expect(layoutSchema.parse(next)).toEqual(next);

describe("adding items", () => {
	it("adds each item kind at the room centre with an id no existing item uses", () => {
		const all = (l: Layout) => [...l.zones, ...l.desks, ...l.decor, ...l.callouts].map((i) => i.id);
		const next = addLabel(addZone(addDecor(addDesk(layout), "plant")));
		valid(next);
		const before = new Set(all(layout));
		const added = all(next).filter((id) => !before.has(id));
		expect(added).toHaveLength(4);
		expect(new Set(added).size).toBe(4);
		expect(next.desks.at(-1)?.position).toEqual({ x: 0, z: 0 });
		expect(next.decor.at(-1)?.kind).toBe("plant");
		expect(next.zones.at(-1)?.rug?.center).toEqual({ x: 0, z: 0 });
		expect(next.callouts.at(-1)?.position).toEqual({ x: 0, z: 0 });
	});

	it("never reuses an id across repeated adds", () => {
		const twice = addDesk(addDesk(layout));
		expect(twice.desks.at(-2)?.id).not.toBe(twice.desks.at(-1)?.id);
		expect(freshId(twice, "desk")).toBe("desk-3");
	});

	it("mounts wall kinds on the wall height and floor kinds on the floor", () => {
		expect(addDecor(layout, "wall-clock").decor.at(-1)?.elevation).toBeGreaterThan(2);
		expect(addDecor(layout, "sofa").decor.at(-1)?.elevation).toBe(0);
	});
});

describe("moveItem", () => {
	it("snaps to the 0.25 m grid", () => {
		const next = moveItem(layout, { kind: "desk", id: "sales-1" }, { x: 1.13, z: -2.38 });
		expect(itemPosition(next, { kind: "desk", id: "sales-1" })).toEqual({ x: 1.25, z: -2.5 });
		valid(next);
	});

	it("clamps inside the 26 × 20 room", () => {
		const next = moveItem(layout, { kind: "decor", id: "tv" }, { x: 99, z: -99 });
		expect(itemPosition(next, { kind: "decor", id: "tv" })).toEqual({ x: 13, z: -10 });
	});

	it("keeps a moved zone's whole rug in the room and carries its label along", () => {
		const zone = { kind: "zone", id: "sales" } as const;
		const before = layout.zones.find((z) => z.id === "sales");
		const next = moveItem(layout, zone, { x: -99, z: 0 });
		const after = next.zones.find((z) => z.id === "sales");
		expect(after?.rug?.center.x).toBeGreaterThanOrEqual(-13 + (before?.rug?.width ?? 0) / 2);
		if (before?.labelAt && after?.labelAt && before.rug && after.rug) {
			expect(after.labelAt.x - before.labelAt.x).toBeCloseTo(
				after.rug.center.x - before.rug.center.x,
			);
		}
		valid(next);
	});

	it("leaves the layout unchanged for an unknown item", () => {
		const next = moveItem(layout, { kind: "desk", id: "nope" }, { x: 1, z: 1 });
		expect(next.desks).toEqual(layout.desks);
	});
});

describe("rotateItem", () => {
	it("turns in 90° steps and normalises into [0, 360)", () => {
		const desk = { kind: "desk", id: "open-1" } as const; // starts at 90°
		const rotationOf = (next: Layout) => next.desks.find((d) => d.id === "open-1")?.rotation;
		expect(rotationOf(rotateItem(layout, desk, -1))).toBe(0);
		expect(rotationOf(rotateItem(rotateItem(layout, desk, -1), desk, -1))).toBe(270);
		expect(rotationOf(rotateItem(rotateItem(rotateItem(layout, desk, 1), desk, 1), desk, 1))).toBe(
			0,
		);
	});

	it("swaps a zone rug's width and depth", () => {
		const next = rotateItem(layout, { kind: "zone", id: "delivery" }, 1);
		const rug = next.zones.find((z) => z.id === "delivery")?.rug;
		expect([rug?.width, rug?.depth]).toEqual([6.6, 9.6]);
		valid(next);
	});
});

describe("deleteItem", () => {
	it("removes the item", () => {
		const next = deleteItem(layout, { kind: "decor", id: "tv" });
		expect(next.decor.some((d) => d.id === "tv")).toBe(false);
		expect(next.decor).toHaveLength(layout.decor.length - 1);
	});

	it("deleting a zone unassigns its desks but keeps them", () => {
		const next = deleteItem(layout, { kind: "zone", id: "sales" });
		expect(next.zones.some((z) => z.id === "sales")).toBe(false);
		expect(next.desks).toHaveLength(layout.desks.length);
		expect(next.desks.filter((d) => d.zoneId === "sales")).toEqual([]);
		expect(next.desks.find((d) => d.id === "sales-1")).not.toHaveProperty("zoneId");
		valid(next);
	});
});

describe("updates", () => {
	it("edits a zone's text, binds a workspace and clears fields set to empty", () => {
		const next = updateZone(layout, "sales", { title: "OPS", subtitle: "", workspaceLabel: "ops" });
		const zone = next.zones.find((z) => z.id === "sales");
		expect(zone?.title).toBe("OPS");
		expect(zone?.workspaceLabel).toBe("ops");
		expect(zone).not.toHaveProperty("subtitle");
		valid(next);
	});

	it("resizes a rug within limits and keeps it inside the room", () => {
		const next = updateZone(layout, "delivery", {
			rugWidth: 0.1,
			rugDepth: 500,
			rugColor: "#123456",
		});
		const rug = next.zones.find((z) => z.id === "delivery")?.rug;
		expect(rug?.width).toBe(1);
		expect(rug?.depth).toBe(20);
		expect(rug?.center.z).toBe(0);
		expect(rug?.color).toBe("#123456");
	});

	it("pins an agent to a desk and only accepts existing zones", () => {
		const pinned = updateDesk(layout, "open-1", { agentName: "nora", zoneId: "ghost" });
		const desk = pinned.desks.find((d) => d.id === "open-1");
		expect(desk?.agentName).toBe("nora");
		expect(desk).not.toHaveProperty("zoneId");
		const unpinned = updateDesk(pinned, "open-1", { agentName: "" });
		expect(unpinned.desks.find((d) => d.id === "open-1")).not.toHaveProperty("agentName");
	});

	it("sets and clears a decor label", () => {
		const labelled = updateDecor(layout, "tv", { label: "News" });
		expect(labelled.decor.find((d) => d.id === "tv")?.label).toBe("News");
		expect(
			updateDecor(labelled, "tv", { label: "" }).decor.find((d) => d.id === "tv"),
		).not.toHaveProperty("label");
	});

	it("claims the desks standing on a zone's rug", () => {
		const withZone = addZone(addDesk(layout, { x: 0, z: 0 }));
		const zoneId = withZone.zones.at(-1)?.id ?? "";
		const next = claimDesks(withZone, zoneId);
		expect(next.desks.at(-1)?.zoneId).toBe(zoneId);
		expect(next.desks.find((d) => d.id === "sales-1")?.zoneId).toBe("sales");
	});
});
