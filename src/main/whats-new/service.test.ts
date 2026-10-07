import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { UpdateCommit } from "@shared/app-update";
import { beforeEach, describe, expect, it } from "vitest";
import { type BeadDetail, type WhatsNewDeps, WhatsNewService } from "./service";

const BUILT = "bbbbbbbbbbbbbbbb";
const SEEN = "aaaaaaaaaaaaaaaa";
const LOG: UpdateCommit[] = [
	{ sha: "3", subject: "Merge bead/office-c3y" },
	{ sha: "2", subject: "office-c3y: What's new card" },
	{ sha: "1", subject: "Bump vite" },
];
const DETAILS: BeadDetail[] = [
	{
		id: "office-c3y",
		title: "What's new card",
		notes: "abc on bead/office-c3y\nTry it: relaunch and rate a row",
	},
];

let statePath: string;

beforeEach(async () => {
	statePath = join(await mkdtemp(join(tmpdir(), "whats-new-")), "whats-new.json");
});

function service(overrides: Partial<WhatsNewDeps> = {}) {
	const calls: string[] = [];
	const deps: WhatsNewDeps = {
		built: BUILT,
		statePath,
		git: { isAncestor: async () => true, log: async () => LOG },
		details: async () => DETAILS,
		comment: async (id, text) => {
			calls.push(`comment ${id} ${text}`);
			return { ok: true, revision: 1 };
		},
		tellChief: async (text) => {
			calls.push(`chief ${text}`);
			return { state: "sent" };
		},
		...overrides,
	};
	return { whatsNew: new WhatsNewService(deps), calls };
}

const seen = (pending: unknown = null) =>
	writeFile(statePath, JSON.stringify({ version: 1, lastSeenBuild: SEEN, pending }));

describe("WhatsNewService", () => {
	it("remembers the first launch without a card", async () => {
		expect(await service().whatsNew.get()).toBeNull();
		expect(JSON.parse(await readFile(statePath, "utf8"))).toMatchObject({ lastSeenBuild: BUILT });
	});

	it("lists the beads since the last seen build with title and try-it, other commits apart", async () => {
		await seen();
		expect(await service().whatsNew.get()).toEqual({
			built: BUILT,
			recent: false,
			beads: [
				{
					id: "office-c3y",
					title: "What's new card",
					subject: "office-c3y: What's new card",
					tryIt: "relaunch and rate a row",
					rating: null,
				},
			],
			others: ["Bump vite"],
			ratingOff: null,
		});
	});

	it("comments the thumbs as Jeremy, tells the chief about a thumbs down, and keeps ratings across a relaunch", async () => {
		await seen();
		const { whatsNew, calls } = service();
		expect(await whatsNew.rate("office-c3y", "up", "")).toEqual({ ok: true });
		expect(await whatsNew.rate("office-c3y", "down", "the card covers the clock")).toEqual({
			ok: true,
		});
		expect(calls).toEqual([
			"comment office-c3y 👍 after update bbbbbbb",
			"comment office-c3y 👎 after update bbbbbbb: the card covers the clock",
			"chief 👎 office-c3y (What's new card): the card covers the clock",
		]);
		const relaunched = await service().whatsNew.get();
		expect(relaunched?.beads[0]?.rating).toBe("down");
	});

	it("never shows a dismissed build again", async () => {
		await seen();
		await service().whatsNew.dismiss();
		expect(await service().whatsNew.get()).toBeNull();
	});

	it("degrades to commit summaries with rating off when bd fails, and to no card when git fails", async () => {
		await seen();
		const noBd = service({ details: () => Promise.reject(new Error("bd: command not found")) });
		const card = await noBd.whatsNew.get();
		expect(card?.beads[0]).toMatchObject({
			title: null,
			tryIt: null,
			subject: "office-c3y: What's new card",
		});
		expect(card?.ratingOff).toContain("bd: command not found");
		expect(await noBd.whatsNew.rate("office-c3y", "up", "")).toMatchObject({ ok: false });
		expect(noBd.calls).toEqual([]);
		const noGit = service({
			git: { isAncestor: async () => true, log: () => Promise.reject(new Error("git failed")) },
		});
		expect(await noGit.whatsNew.get()).toBeNull();
	});

	it("lists recent commits under a rewritten history, and moves ids bd doesn't know to other changes", async () => {
		await seen();
		const logs: (readonly string[])[] = [];
		const { whatsNew } = service({
			git: {
				isAncestor: async () => false,
				log: async (args) => {
					logs.push(args);
					return LOG;
				},
			},
			details: async () => [],
		});
		const card = await whatsNew.get();
		expect(logs).toEqual([["-n", "20", BUILT]]);
		expect(card).toMatchObject({
			recent: true,
			beads: [],
			others: ["Bump vite", "office-c3y: What's new card"],
		});
	});
});
