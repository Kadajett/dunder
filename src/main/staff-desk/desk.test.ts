import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { avatarStyleFor } from "@shared/avatar/style";
import { type Roster, rosterSchema } from "@shared/company/roster";
import { type SessionSnapshot, sessionSnapshotSchema } from "@shared/herdr/schema";
import type { StaffAction, StaffOutcome } from "@shared/staff";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StaffDesk } from "./desk";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const CHIEF_PANE = "w9:p1";
const WORKER_PANE = "w1:p1";

function rosterAgent(name: string, role: string) {
	return {
		id: `id-${name}`,
		name,
		style: avatarStyleFor(name),
		role,
		harness: "omp",
		workspaceLabel: "hq",
		cwd: "/work",
		createdAt: new Date(0).toISOString(),
	};
}

const roster: Roster = rosterSchema.parse({
	version: 1,
	agents: [rosterAgent("max", "chief-of-staff"), rosterAgent("jonas", "generalist")],
});

const office: SessionSnapshot = sessionSnapshotSchema.parse({
	version: "0.9.3",
	protocol: 22,
	workspaces: [],
	tabs: [],
	panes: [],
	agents: [
		["max", CHIEF_PANE],
		["jonas", WORKER_PANE],
	].map(([name, pane_id], index) => ({
		pane_id,
		tab_id: "w1:t1",
		workspace_id: "w1",
		terminal_id: `t${index}`,
		focused: false,
		agent_status: "idle",
		agent: "omp",
		name,
	})),
});

function setup() {
	const dir = mkdtempSync(join(tmpdir(), "staff-desk-"));
	dirs.push(dir);
	const outcomes: StaffOutcome[] = [];
	const staffing = {
		hire: vi.fn(async (_request: unknown) => ({ ok: true }) as const),
		fire: vi.fn(async (_name: string) => ({ ok: true }) as const),
		restart: vi.fn(async (_name: string) => ({ ok: true }) as const),
	};
	const deps = {
		staffing,
		setModel: vi.fn(async () => ({ state: "applied" }) as const),
		roster: () => roster,
		modelOf: () => undefined,
		writeBrief: vi.fn(async (_name: string, _brief: string) => undefined),
		defaults: { room: "delivery", cwd: "/app" },
		requestsPath: join(dir, "requests.ndjson"),
		resultsPath: join(dir, "results.ndjson"),
		statePath: join(dir, "state.json"),
		emit: (outcome: StaffOutcome) => outcomes.push(outcome),
	};
	const desk = new StaffDesk(deps);
	const line = (request: StaffAction, fromPane = CHIEF_PANE) =>
		JSON.stringify({
			v: 1,
			id: crypto.randomUUID(),
			fromPane,
			requestedAt: new Date().toISOString(),
			request,
		});
	const results = () =>
		readFileSync(deps.resultsPath, "utf8")
			.trim()
			.split("\n")
			.map((text) => JSON.parse(text) as { id: string; ok: boolean; message: string });
	return { desk, deps, staffing, outcomes, line, results };
}

describe("StaffDesk", () => {
	it("brings a hire request from the chief's pane to staffing with the full hire input", async () => {
		const { desk, deps, staffing, outcomes, line, results } = setup();
		desk.updateSnapshot(office);
		desk.receive([
			line({
				action: "hire",
				name: "raina",
				role: "product-manager",
				model: "anthropic/claude-opus-5-5:high",
				brief: "Loves Zelda.",
			}),
		]);
		await desk.settled();
		expect(deps.writeBrief).toHaveBeenCalledWith("raina", "Loves Zelda.");
		expect(staffing.hire).toHaveBeenCalledWith({
			name: "raina",
			role: "product-manager",
			harness: "omp",
			model: "anthropic/claude-opus-5-5:high",
			workspaceLabel: "delivery",
			cwd: "/app",
			style: avatarStyleFor("raina"),
		});
		expect(results()).toEqual([expect.objectContaining({ ok: true })]);
		expect(outcomes).toEqual([
			expect.objectContaining({ by: "max", action: "hire", name: "raina", ok: true }),
		]);
	});

	it("refuses requests from any other pane, answering why and touching nothing", async () => {
		const { desk, deps, staffing, outcomes, line, results } = setup();
		desk.updateSnapshot(office);
		desk.receive([
			line({ action: "fire", name: "max" }, WORKER_PANE),
			line({ action: "model", name: "max", model: "x/y" }, "w5:p5"),
		]);
		await desk.settled();
		expect(staffing.fire).not.toHaveBeenCalled();
		expect(deps.setModel).not.toHaveBeenCalled();
		expect(results().map((r) => r.ok)).toEqual([false, false]);
		expect(results()[0]?.message).toContain("only the chief of staff (max)");
		expect(outcomes.map((o) => [o.by, o.ok])).toEqual([
			["jonas", false],
			["w5:p5", false],
		]);
	});

	it("holds requests read before the first snapshot, then applies them", async () => {
		const { desk, staffing, line } = setup();
		desk.receive([line({ action: "restart", name: "jonas" })]);
		await desk.settled();
		expect(staffing.restart).not.toHaveBeenCalled();
		desk.updateSnapshot(office);
		await desk.settled();
		expect(staffing.restart).toHaveBeenCalledWith("jonas");
	});

	it("splits model:thinking for the model service and keeps the chief from firing themself", async () => {
		const { desk, deps, staffing, line, results } = setup();
		desk.updateSnapshot(office);
		desk.receive([
			line({ action: "model", name: "jonas", model: "anthropic/claude-opus-5-5:high" }),
			line({ action: "fire", name: "max" }),
		]);
		await desk.settled();
		expect(deps.setModel).toHaveBeenCalledWith("jonas", "anthropic/claude-opus-5-5", "high");
		expect(staffing.fire).not.toHaveBeenCalled();
		expect(results().map((r) => r.ok)).toEqual([true, false]);
	});

	it("answers malformed requests by id, and lists the roster", async () => {
		const { desk, line, results } = setup();
		desk.updateSnapshot(office);
		const bad = JSON.stringify({
			v: 1,
			id: "bad-request-1",
			fromPane: CHIEF_PANE,
			requestedAt: new Date().toISOString(),
			request: { action: "hire", name: "Raina!", role: "pm" },
		});
		desk.receive([bad, line({ action: "list" })]);
		await desk.settled();
		await vi.waitFor(() => expect(results()).toHaveLength(2));
		const invalid = results().find((result) => result.id === "bad-request-1");
		const list = results().find((result) => result.message.startsWith("the roster"));
		expect(invalid).toMatchObject({ id: "bad-request-1", ok: false });
		expect(invalid?.message).toMatch(/^name: /);
		expect(list?.message).toMatch(/NAME\s+ROLE\s+HARNESS\s+MODEL\s+ROOM\s+STATUS/);
		expect(list?.message).toMatch(/jonas\s+generalist\s+omp\s+default\s+hq\s+idle/);
	});
});
