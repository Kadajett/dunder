import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Company } from "@shared/company/company";
import { firstCompany, seedCompany } from "@shared/company/company-ops";
import { DEFAULT_LAYOUT } from "@shared/layout/default-layout";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadCompanies, openCompanies, saveCompany, saveCurrentId } from "./store";

const NOW = new Date("2026-10-06T12:00:00.000Z");
const LATER = new Date("2026-10-07T12:00:00.000Z");

let dir = "";
beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "companies-"));
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe("company store", () => {
	it("round-trips saved companies, oldest first, creating the directory", async () => {
		const nested = join(dir, "companies");
		const acme = seedCompany("acme", "Acme", "rockets", LATER);
		const office = firstCompany(NOW);
		await saveCompany(nested, acme);
		await saveCompany(nested, office);
		expect(await loadCompanies(nested)).toEqual([office, acme]);
		expect((await readdir(nested)).sort()).toEqual(["acme.json", "dunder-mifflin.json"]);
	});

	it("seeds today's office on first run and makes it current", async () => {
		const opened = await openCompanies(dir, NOW);
		expect(opened).toEqual({ companies: [firstCompany(NOW)], currentId: "dunder-mifflin" });
		expect(await openCompanies(dir, LATER)).toEqual(opened);
	});

	it("restores the saved current company", async () => {
		await saveCompany(dir, firstCompany(NOW));
		await saveCompany(dir, seedCompany("acme", "Acme", "", LATER));
		await saveCurrentId(dir, "acme");
		expect((await openCompanies(dir, LATER)).currentId).toBe("acme");
	});

	it("falls back to the oldest company when current.json names a missing one", async () => {
		await saveCompany(dir, firstCompany(NOW));
		await saveCurrentId(dir, "gone");
		expect((await openCompanies(dir, LATER)).currentId).toBe("dunder-mifflin");
		expect(JSON.parse(await readFile(join(dir, "current.json"), "utf8"))).toEqual({
			id: "dunder-mifflin",
		});
	});

	it("moves invalid files aside instead of overwriting them", async () => {
		await writeFile(join(dir, "broken.json"), '{"version":99}');
		await writeFile(join(dir, "current.json"), "not json");
		const valid = seedCompany("acme", "Acme", "", NOW);
		// A company whose id disagrees with its file name is invalid too.
		await writeFile(join(dir, "other.json"), JSON.stringify(valid));
		const opened = await openCompanies(dir, NOW);
		expect(opened.companies.map((company) => company.id)).toEqual(["dunder-mifflin"]);
		const stamp = "invalid-2026-10-06T12-00-00.000Z";
		expect(await readFile(join(dir, `broken.json.${stamp}`), "utf8")).toBe('{"version":99}');
		expect(await readFile(join(dir, `current.json.${stamp}`), "utf8")).toBe("not json");
		expect(await readFile(join(dir, `other.json.${stamp}`), "utf8")).toBe(JSON.stringify(valid));
	});

	it("moves a floor saved on the former default to the current one and keeps a chosen colour", async () => {
		const withFloor = (company: Company, floorColor: string): Company => ({
			...company,
			layout: { ...company.layout, room: { ...company.layout.room, floorColor } },
		});
		await saveCompany(dir, withFloor(firstCompany(NOW), "#cfa979"));
		await saveCompany(dir, withFloor(seedCompany("acme", "Acme", "", LATER), "#3a5f8c"));
		const floors = (await loadCompanies(dir)).map((company) => company.layout.room.floorColor);
		expect(floors).toEqual([DEFAULT_LAYOUT.room.floorColor, "#3a5f8c"]);
		expect(DEFAULT_LAYOUT.room.floorColor).not.toBe("#cfa979");
	});

	it("moves walls saved at the former default height to the current one and keeps a chosen height", async () => {
		const withWalls = (company: Company, wallHeight: number): Company => ({
			...company,
			layout: { ...company.layout, room: { ...company.layout.room, wallHeight } },
		});
		// The former default floor too: both migrate independently in one pass.
		const former = withWalls(firstCompany(NOW), 4.2);
		await saveCompany(dir, {
			...former,
			layout: { ...former.layout, room: { ...former.layout.room, floorColor: "#cfa979" } },
		});
		await saveCompany(dir, withWalls(seedCompany("acme", "Acme", "", LATER), 5));
		const rooms = (await loadCompanies(dir)).map((company) => company.layout.room);
		expect(rooms.map((room) => room.wallHeight)).toEqual([DEFAULT_LAYOUT.room.wallHeight, 5]);
		expect(rooms[0]?.floorColor).toBe(DEFAULT_LAYOUT.room.floorColor);
		expect(DEFAULT_LAYOUT.room.wallHeight).not.toBe(4.2);
	});

	it("loads a company saved with zone labels: label fields stripped, label-only zones dropped", async () => {
		const company = seedCompany("acme", "Acme", "", NOW);
		const sales = company.layout.zones[0];
		const labelled = {
			...sales,
			subtitle: "growth",
			labelAt: { x: 1, z: 2 },
			labelHeight: 2.2,
			labelMode: "always",
		};
		const saved = {
			...company,
			layout: {
				...company.layout,
				zones: [
					labelled,
					{ id: "clients", title: "CLIENTS", subtitle: "the CRM", labelAt: { x: 0, z: 0 } },
					{ id: "reception", title: "RECEPTION", labelAt: { x: 5, z: 7 }, labelMode: "hover" },
					// No rug, but a desk sits in it: still a zone.
					{ id: "annex", title: "ANNEX", labelAt: { x: 3, z: 3 } },
				],
				desks: [
					...company.layout.desks,
					{ id: "a-1", position: { x: 3, z: 3 }, rotation: 0, zoneId: "annex" },
				],
			},
		};
		await writeFile(join(dir, "acme.json"), JSON.stringify(saved));
		const [loaded] = await loadCompanies(dir);
		expect(loaded?.layout.zones).toEqual([sales, { id: "annex", title: "ANNEX" }]);
	});
});

describe("sales floor move toward the TV (office-miz)", () => {
	const FORMER_DESKS: Record<string, { x: number; z: number }> = {
		"sales-1": { x: -8.3, z: 2 },
		"sales-2": { x: -5.2, z: 2 },
		"sales-3": { x: -6.8, z: 5.2 },
	};
	const ACCESS = {
		id: "access",
		title: "ACCESS",
		subtitle: "herdr · office session",
		position: { x: 11.6, z: -5.4 },
		height: 2.6,
		tone: "light",
	} as const;

	type SavedLayout = Omit<Company["layout"], "migrations"> & { migrations?: string[] };

	/** A layout as saved before office-miz: old sales spots, the ACCESS callout, no markers. */
	function formerLayout(): SavedLayout {
		const { migrations: _, ...layout } = seedCompany("acme", "Acme", "", NOW).layout;
		return {
			...layout,
			zones: layout.zones.map((zone) =>
				zone.id === "sales" && zone.rug
					? { ...zone, rug: { ...zone.rug, center: { x: -6.6, z: 3.4 }, width: 7.6 } }
					: zone,
			),
			desks: layout.desks.map((desk) => {
				const position = FORMER_DESKS[desk.id];
				return position ? { ...desk, position } : desk;
			}),
			callouts: [ACCESS],
		};
	}

	async function load(layout: SavedLayout): Promise<Company["layout"] | undefined> {
		const company = { ...seedCompany("acme", "Acme", "", NOW), layout };
		await writeFile(join(dir, "acme.json"), JSON.stringify(company));
		const [loaded] = await loadCompanies(dir);
		return loaded?.layout;
	}

	const salesOf = (layout: SavedLayout | undefined) => ({
		rug: layout?.zones.find((zone) => zone.id === "sales")?.rug,
		desks: layout?.desks.filter((desk) => desk.zoneId === "sales").map((desk) => desk.position),
	});

	it("moves a sales floor left at its former default and drops the default ACCESS callout", async () => {
		const layout = await load(formerLayout());
		expect(salesOf(layout)).toEqual(salesOf(DEFAULT_LAYOUT));
		expect(layout?.callouts).toEqual([]);
		expect(layout?.migrations).toEqual(DEFAULT_LAYOUT.migrations);
	});

	it("leaves a sales floor the user changed, and an ACCESS callout they moved", async () => {
		const former = formerLayout();
		const edited: SavedLayout = {
			...former,
			// One desk nudged is enough to make the whole floor theirs.
			desks: former.desks.map((desk) =>
				desk.id === "sales-2" ? { ...desk, position: { x: -5, z: 2 } } : desk,
			),
			callouts: [{ ...ACCESS, position: { x: 2, z: 2 } }],
		};
		const layout = await load(edited);
		expect(salesOf(layout)).toEqual(salesOf(edited));
		expect(layout?.callouts).toEqual(edited.callouts);
		expect(layout?.migrations).toEqual(DEFAULT_LAYOUT.migrations);
	});

	it("runs once: a floor moved back after the migration stays where the user put it", async () => {
		const former = formerLayout();
		const layout = await load({ ...former, migrations: DEFAULT_LAYOUT.migrations });
		expect(salesOf(layout)).toEqual(salesOf(former));
		expect(layout?.callouts).toEqual([ACCESS]);
	});
});

describe("whiteboard by the couches (office-hgr.3)", () => {
	type Layout = Company["layout"];

	async function load(layout: Layout): Promise<Layout> {
		const company = { ...seedCompany("acme", "Acme", "", NOW), layout };
		await writeFile(join(dir, "acme.json"), JSON.stringify(company));
		const [loaded] = await loadCompanies(dir);
		if (!loaded) throw new Error("company did not load");
		return loaded.layout;
	}

	const withoutBoard = (layout: Layout): Layout => ({
		...layout,
		decor: layout.decor.filter((item) => item.kind !== "whiteboard"),
	});
	const boards = (layout: Layout) =>
		layout.decor.filter((item) => item.kind === "whiteboard").map((item) => item.id);
	/** Saved after office-miz, before the whiteboard existed. */
	const savedBeforeBoard = (): Layout =>
		withoutBoard({ ...seedCompany("acme", "Acme", "", NOW).layout, migrations: ["sales-near-tv"] });

	it("hangs the board in a layout saved before it, once: a board deleted afterwards stays gone", async () => {
		const hung = await load(savedBeforeBoard());
		expect(boards(hung)).toEqual(["whiteboard"]);
		expect(hung.migrations).toEqual(DEFAULT_LAYOUT.migrations);
		expect(boards(await load(withoutBoard(hung)))).toEqual([]);
	});

	it("adds no second board to a layout that has one", async () => {
		const own = {
			id: "my-board",
			kind: "whiteboard",
			position: { x: 0, z: -10 },
			rotation: 0,
			elevation: 1.5,
		} as const;
		const saved = savedBeforeBoard();
		const layout = await load({ ...saved, decor: [...saved.decor, own] });
		expect(boards(layout)).toEqual(["my-board"]);
	});
});
