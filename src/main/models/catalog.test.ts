import { describe, expect, it } from "vitest";
import { createModelCatalog, parseCatalog } from "./catalog";

const entry = (selector: string, kind: string, thinking: string[] | null) => ({
	provider: "p",
	kind,
	id: selector,
	selector,
	name: selector.toUpperCase(),
	contextWindow: 1000,
	thinking,
	cost: { input: 1 },
});

describe("parseCatalog", () => {
	it("keeps chat models and maps missing thinking control to no levels", () => {
		const stdout = JSON.stringify({
			models: [
				entry("p/a", "chat", ["low"]),
				entry("p/img", "image", null),
				entry("p/b", "chat", null),
			],
		});
		expect(parseCatalog(stdout)).toEqual([
			{ selector: "p/a", name: "P/A", provider: "p", thinking: ["low"], contextWindow: 1000 },
			{ selector: "p/b", name: "P/B", provider: "p", thinking: [], contextWindow: 1000 },
		]);
	});

	it("throws on output that is not a catalog", () => {
		expect(() => parseCatalog('{"models":[{"selector":1}]}')).toThrow();
	});
});

describe("createModelCatalog", () => {
	it("loads once, reloads on refresh, and retries after a failed load", async () => {
		const outputs = ["oops", JSON.stringify({ models: [entry("p/a", "chat", null)] })];
		let loads = 0;
		const catalog = createModelCatalog(async () => outputs[Math.min(loads++, 1)] ?? "");
		await expect(catalog.list()).rejects.toThrow();
		expect(await catalog.list()).toHaveLength(1);
		expect(await catalog.list()).toHaveLength(1);
		expect(loads).toBe(2);
		await catalog.refresh();
		expect(loads).toBe(3);
	});
});
