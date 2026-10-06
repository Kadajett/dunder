import { avatarStyleFor } from "@shared/avatar/style";
import type { ModelOption } from "@shared/models";
import { describe, expect, it } from "vitest";
import { checkHire, type HireRequest } from "./workforce";

const catalog: ModelOption[] = [
	{
		selector: "anthropic/claude-opus-5-5",
		name: "Opus",
		provider: "anthropic",
		thinking: ["low", "high"],
		contextWindow: 200_000,
	},
];

const valid: HireRequest = {
	name: "kim",
	role: "backend",
	harness: "omp",
	workspaceLabel: "delivery",
	cwd: "/home/me/project",
	style: avatarStyleFor("kim"),
};

const taken = new Set(["nora", "fired-fred"]);

function errorOf(patch: Partial<HireRequest>, context = { takenNames: taken, catalog }) {
	const result = checkHire({ ...valid, ...patch }, context);
	return result.ok ? undefined : result.error;
}

describe("checkHire", () => {
	it("accepts a well-formed hire and trims its free text", () => {
		const result = checkHire({ ...valid, role: "  backend " }, { takenNames: taken, catalog });
		expect(result).toEqual({ ok: true, hire: { ...valid, role: "backend" } });
	});

	it("only accepts names herdr can give a live agent", () => {
		expect(errorOf({ name: "Kim" })).toMatch(/^name:/);
		expect(errorOf({ name: "9lives" })).toMatch(/^name:/);
		expect(errorOf({ name: "k".repeat(33) })).toMatch(/^name:/);
		expect(errorOf({ name: "kim_2-b" })).toBeUndefined();
	});

	it("never reuses a name, including a fired worker's", () => {
		expect(errorOf({ name: "fired-fred" })).toMatch(/already taken/);
	});

	it("checks omp models against the catalog, thinking level included", () => {
		expect(errorOf({ model: "anthropic/claude-opus-5-5" })).toBeUndefined();
		expect(errorOf({ model: "anthropic/claude-opus-5-5:high" })).toBeUndefined();
		expect(errorOf({ model: "anthropic/claude-opus-5-5:max" })).toMatch(/^model:/);
		expect(errorOf({ model: "made/up" })).toMatch(/^model:/);
	});

	it("passes other harnesses' models through, and skips the check without a catalog", () => {
		expect(errorOf({ harness: "claude", model: "sonnet" })).toBeUndefined();
		expect(errorOf({ model: "made/up" }, { takenNames: taken, catalog: [] })).toMatch(/^model:/);
		expect(checkHire({ ...valid, model: "made/up" }, { takenNames: taken }).ok).toBe(true);
	});

	it("needs a role, a room and an absolute project directory", () => {
		expect(errorOf({ role: "  " })).toMatch(/^role:/);
		expect(errorOf({ workspaceLabel: "" })).toMatch(/^workspaceLabel:/);
		expect(errorOf({ cwd: "project" })).toMatch(/^cwd:/);
	});

	it("rejects unknown harnesses and malformed looks", () => {
		expect(checkHire({ ...valid, harness: "gemini" }, { takenNames: taken }).ok).toBe(false);
		expect(checkHire({ ...valid, style: { skin: "blue" } }, { takenNames: taken }).ok).toBe(false);
	});
});
