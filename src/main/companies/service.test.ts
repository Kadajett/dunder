import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Company } from "@shared/company/company";
import { DEFAULT_LAYOUT } from "@shared/layout/default-layout";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CliResult } from "../herdr/cli";
import { CompaniesService } from "./service";

const NOW = new Date("2026-10-06T12:00:00.000Z");

let dir = "";
let emitted: Company[] = [];
let calls: string[][] = [];
let workspaces: { workspace_id: string; label: string }[] = [];

function cli(args: readonly string[]): Promise<CliResult> {
	calls.push([...args]);
	const result =
		args[1] === "list"
			? { type: "workspace_list", workspaces }
			: {
					workspace: { workspace_id: "w9", label: String(args[3]) },
					root_pane: { pane_id: "w9-1" },
				};
	return Promise.resolve({ stdout: JSON.stringify({ result }), stderr: "" });
}

function open(): CompaniesService {
	return new CompaniesService({
		dir,
		appRoot: "/app",
		cli,
		emit: (company) => emitted.push(company),
		now: () => NOW,
	});
}

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "companies-"));
	emitted = [];
	calls = [];
	workspaces = [{ workspace_id: "w1", label: "sales" }];
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe("companies service", () => {
	it("renames the company, repaints the sign and survives a restart", async () => {
		await open().rename("dunder-mifflin", "  Keller Talent ", "AI-native recruiting");
		const current = await open().current();
		expect(current).toMatchObject({ id: "dunder-mifflin", name: "Keller Talent" });
		expect(current.layout.room.sign).toMatchObject({
			title: "KELLER TALENT",
			subtitle: "AI-NATIVE RECRUITING",
		});
		expect(emitted.map((company) => company.name)).toEqual(["Keller Talent"]);
	});

	it("creates companies in a fresh office and switches back to the first one's layout", async () => {
		const companies = open();
		const edited = { ...DEFAULT_LAYOUT, desks: DEFAULT_LAYOUT.desks.slice(1) };
		await companies.saveLayout(edited);
		const acme = await companies.create("Acme", "rockets");
		const twin = await companies.create("acme", "");
		expect([acme.id, twin.id]).toEqual(["acme", "acme-2"]);
		expect((await companies.current()).id).toBe("acme-2");
		expect(twin.layout.desks).toEqual(DEFAULT_LAYOUT.desks);
		await companies.switchTo("dunder-mifflin");
		const restarted = await open().current();
		expect(restarted.layout.desks).toEqual(edited.desks);
		expect((await companies.list()).map((company) => company.id)).toEqual([
			"dunder-mifflin",
			"acme",
			"acme-2",
		]);
	});

	it("rejects invalid layouts and names without changing anything", async () => {
		const companies = open();
		await expect(companies.saveLayout({ version: 2 })).rejects.toThrow();
		await expect(companies.rename("dunder-mifflin", "   ", "")).rejects.toThrow();
		await expect(companies.switchTo("nope")).rejects.toThrow('no company "nope"');
		expect((await companies.current()).layout).toEqual(DEFAULT_LAYOUT);
		expect(emitted).toEqual([]);
	});

	it("keeps the wall sign the company's when a layout is saved", async () => {
		const companies = open();
		const room = { ...DEFAULT_LAYOUT.room, sign: { title: "X", subtitle: "Y", offset: 3 } };
		await companies.saveLayout({ ...DEFAULT_LAYOUT, room });
		expect((await companies.current()).layout.room.sign).toEqual({
			title: "DUNDER MIFFLIN",
			subtitle: DEFAULT_LAYOUT.room.sign.subtitle,
			offset: 3,
		});
	});

	it("reuses a labelled workspace and creates a missing one in the app root", async () => {
		const companies = open();
		expect(await companies.ensureWorkspace("sales")).toEqual({ workspaceId: "w1" });
		expect(await companies.ensureWorkspace("research")).toEqual({ workspaceId: "w9" });
		expect(calls.at(-1)).toEqual([
			"workspace",
			"create",
			"--label",
			"research",
			"--cwd",
			"/app",
			"--no-focus",
		]);
	});
});
