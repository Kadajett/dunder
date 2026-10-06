import { avatarStyleFor } from "@shared/avatar/style";
import { ADOPTED_ROLE, EMPTY_ROSTER, fireAgent, hireAgent } from "@shared/company/roster-ops";
import { describe, expect, it } from "vitest";
import { type ChiefSeed, ensureChief } from "./chief";

const NOW = new Date("2026-10-06T12:00:00.000Z");
const SEED: ChiefSeed = { name: "max", role: "chief-of-staff", workspaceLabel: "hq", cwd: "/app" };

function ids(): () => string {
	let next = 0;
	return () => `id-${++next}`;
}

const staff = hireAgent(
	EMPTY_ROSTER,
	{ name: "nora", role: "sales", workspaceLabel: "sales", cwd: "/work" },
	NOW,
	"nora-id",
);

describe("ensureChief", () => {
	it("hires max once into hq with the chief role and his own deterministic style", () => {
		const roster = ensureChief(staff, SEED, NOW, ids());
		expect(roster.agents.map((a) => a.name)).toEqual(["nora", "max"]);
		expect(roster.agents[1]).toMatchObject({
			id: "id-1",
			name: "max",
			role: "chief-of-staff",
			workspaceLabel: "hq",
			cwd: "/app",
			createdAt: NOW.toISOString(),
			style: avatarStyleFor("max"),
		});
	});

	it("is idempotent: a second pass returns the same roster with one max", () => {
		const newId = ids();
		const once = ensureChief(staff, SEED, NOW, newId);
		const twice = ensureChief(once, SEED, NOW, newId);
		expect(twice).toBe(once);
		expect(twice.agents.filter((a) => a.name === "max")).toHaveLength(1);
	});

	it("keeps an existing chief under another name instead of hiring max", () => {
		const roster = hireAgent(
			staff,
			{ name: "rita", role: "chief-of-staff", workspaceLabel: "hq", cwd: "/app" },
			NOW,
			"rita-id",
		);
		expect(ensureChief(roster, SEED, NOW, ids())).toBe(roster);
	});

	it("promotes an adopted generalist max in place, keeping his identity", () => {
		const roster = hireAgent(
			staff,
			{ name: "max", role: ADOPTED_ROLE, workspaceLabel: "lab", cwd: "/elsewhere" },
			NOW,
			"max-id",
		);
		const before = roster.agents[1];
		const after = ensureChief(roster, SEED, new Date("2026-10-07T00:00:00.000Z"), ids());
		expect(after.agents).toHaveLength(2);
		expect(after.agents[1]).toEqual({ ...before, role: "chief-of-staff" });
	});

	it("never rehires a max who was let go", () => {
		const hired = ensureChief(staff, SEED, NOW, ids());
		const fired = fireAgent(hired, "id-1", NOW);
		const again = ensureChief(fired, SEED, NOW, ids());
		expect(again).toBe(fired);
		expect(again.agents.filter((a) => a.name === "max")).toHaveLength(1);
	});
});
