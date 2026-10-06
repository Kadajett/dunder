import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT } from "../layout/default-layout";
import { companySchema } from "./company";
import {
	firstCompany,
	seedCompany,
	slugify,
	uniqueCompanyId,
	withCompanySign,
} from "./company-ops";

const NOW = new Date("2026-10-06T12:00:00.000Z");

describe("company ids", () => {
	it("slugifies names to valid ids", () => {
		expect(slugify("Keller Talent!")).toBe("keller-talent");
		expect(slugify("  Café  Ünïcode ")).toBe("cafe-unicode");
		expect(slugify("¿¿??")).toBe("company");
		expect(slugify("x".repeat(80))).toHaveLength(40);
	});

	it("suffixes taken ids until one is free", () => {
		expect(uniqueCompanyId("Acme", [])).toBe("acme");
		expect(uniqueCompanyId("Acme", ["acme"])).toBe("acme-2");
		expect(uniqueCompanyId("ACME", ["acme", "acme-2", "acme-3"])).toBe("acme-4");
	});

	it("keeps a de-duplicated long id within the id limit", () => {
		const id = uniqueCompanyId("y".repeat(80), ["y".repeat(40)]);
		expect(companySchema.shape.id.safeParse(id).success).toBe(true);
	});
});

describe("company seeding", () => {
	it("opens a fresh install at Dunder Mifflin, Scranton branch", () => {
		const company = firstCompany(NOW);
		expect(company).toMatchObject({
			id: "dunder-mifflin",
			name: "Dunder Mifflin",
			subtitle: "Scranton branch · runs on Dunder",
			createdAt: NOW.toISOString(),
			updatedAt: NOW.toISOString(),
		});
		expect(company.layout).toEqual(DEFAULT_LAYOUT);
		expect(companySchema.parse(company)).toEqual(company);
	});

	it("seeds new companies with the default office under their own sign", () => {
		const company = seedCompany("acme", "Acme Labs", "rockets · runs on herdr", NOW);
		expect(company.layout.room.sign).toEqual({
			...DEFAULT_LAYOUT.room.sign,
			title: "ACME LABS",
			subtitle: "ROCKETS · RUNS ON HERDR",
		});
		expect(company.layout.desks).toEqual(DEFAULT_LAYOUT.desks);
	});
});

describe("wall sign", () => {
	it("paints the company name and subtitle without touching the rest of the layout", () => {
		const layout = withCompanySign(DEFAULT_LAYOUT, "Keller Talent", "AI-native recruiting");
		expect(layout.room.sign).toEqual({
			title: "KELLER TALENT",
			subtitle: "AI-NATIVE RECRUITING",
			offset: DEFAULT_LAYOUT.room.sign.offset,
		});
		expect({ ...layout, room: DEFAULT_LAYOUT.room }).toEqual(DEFAULT_LAYOUT);
	});
});
