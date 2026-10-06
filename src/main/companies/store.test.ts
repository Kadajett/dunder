import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { firstCompany, seedCompany } from "@shared/company/company-ops";
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
});
