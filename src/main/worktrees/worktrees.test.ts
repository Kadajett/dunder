import { describe, expect, it } from "vitest";
import { parseWorktrees, pickWorktree, splitCommand } from "./list";
import { WorktreeService } from "./service";

const PORCELAIN = [
	"worktree /repo",
	"HEAD 3ce88a5",
	"branch refs/heads/master",
	"",
	"worktree /trees/theo-office-1vd",
	"HEAD e48519e",
	"branch refs/heads/bead/office-1vd",
	"",
	"worktree /trees/theo-office-txi",
	"HEAD 3ce88a5",
	"branch refs/heads/bead/office-txi",
	"",
	"worktree /trees/theodora-office-zz1",
	"HEAD 1111111",
	"detached",
	"",
].join("\n");

describe("parseWorktrees", () => {
	it("reads paths and short branch names, null when detached", () => {
		expect(parseWorktrees(PORCELAIN)).toEqual([
			{ path: "/repo", branch: "master" },
			{ path: "/trees/theo-office-1vd", branch: "bead/office-1vd" },
			{ path: "/trees/theo-office-txi", branch: "bead/office-txi" },
			{ path: "/trees/theodora-office-zz1", branch: null },
		]);
	});
});

describe("pickWorktree", () => {
	const trees = parseWorktrees(PORCELAIN);
	const changed: Record<string, number> = {
		"/trees/theo-office-1vd": 2,
		"/trees/theo-office-txi": 1,
	};
	const changedAt = (path: string) => changed[path] ?? 0;

	it("takes the worktree of the first listed bead the agent has", () => {
		expect(
			pickWorktree(trees, { agent: "theo", beads: ["office-nope", "office-txi"] }, changedAt)?.path,
		).toBe("/trees/theo-office-txi");
	});

	it("falls back to the most recently changed one, or none when exact", () => {
		expect(pickWorktree(trees, { agent: "theo", beads: [] }, changedAt)?.path).toBe(
			"/trees/theo-office-1vd",
		);
		expect(
			pickWorktree(trees, { agent: "theo", beads: ["office-nope"], exact: true }, changedAt),
		).toBeNull();
	});

	it("never takes another agent's worktree whose name starts the same", () => {
		expect(pickWorktree(trees, { agent: "theodora", beads: [] }, changedAt)?.path).toBe(
			"/trees/theodora-office-zz1",
		);
		expect(pickWorktree(trees, { agent: "max", beads: [] }, changedAt)).toBeNull();
	});
});

describe("splitCommand", () => {
	it("splits flags off the program", () => {
		expect(splitCommand(" code  -n ")).toEqual(["code", ["-n"]]);
		expect(splitCommand("   ")).toBeNull();
	});
});

function service(
	launch: (program: string, args: readonly string[]) => Promise<void>,
	editor = "code -n",
) {
	const git = async (cwd: string, args: readonly string[]): Promise<string> => {
		const command = args.join(" ");
		if (command === "worktree list --porcelain") return PORCELAIN;
		if (command === "rev-parse --abbrev-ref HEAD") return "master\n";
		if (command.startsWith("rev-list --count"))
			return cwd === "/trees/theo-office-txi" ? "3\n" : "0\n";
		if (command.startsWith("status"))
			return cwd === "/trees/theo-office-txi" ? " M src/a.ts\n" : "";
		throw new Error(`unexpected git ${command}`);
	};
	return new WorktreeService({
		root: "/repo",
		git,
		changedAt: async () => 0,
		editorCommand: async () => editor,
		launch,
	});
}

describe("WorktreeService", () => {
	it("finds the agent's worktree with its branch, commits ahead and uncommitted changes", async () => {
		const found = await service(async () => undefined).find({
			agent: "theo",
			beads: ["office-txi"],
			exact: true,
		});
		expect(found).toEqual({
			path: "/trees/theo-office-txi",
			branch: "bead/office-txi",
			ahead: 3,
			base: "master",
			dirty: true,
		});
	});

	it("opens a listed worktree with the editor command and its flags", async () => {
		const launched: string[][] = [];
		const worktrees = service(async (program, args) => {
			launched.push([program, ...args]);
		});
		expect(await worktrees.open("/trees/theo-office-txi")).toEqual({ ok: true });
		expect(launched).toEqual([["code", "-n", "/trees/theo-office-txi"]]);
	});

	it("refuses a folder that isn't one of the app's worktrees", async () => {
		const result = await service(async () => undefined).open("/etc");
		expect(result).toMatchObject({ ok: false });
	});

	it("says clearly when the editor command isn't installed", async () => {
		const missing = Object.assign(new Error("spawn zed ENOENT"), { code: "ENOENT" });
		const result = await service(() => Promise.reject(missing), "zed").open(
			"/trees/theo-office-txi",
		);
		expect(result).toEqual({
			ok: false,
			reason: 'Couldn\'t run "zed": not found. Set the editor command in company settings.',
		});
	});
});
