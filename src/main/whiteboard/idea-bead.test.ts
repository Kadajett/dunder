import { describe, expect, it } from "vitest";
import type { BdRunner } from "../beads/bd";
import { createIdeaBead } from "./idea-bead";

describe("createIdeaBead", () => {
	it("creates a P3 idea with the note author and complete note text", async () => {
		let args: readonly string[] = [];
		let cwd = "";
		const runBd: BdRunner = async (command, directory) => {
			args = command;
			cwd = directory;
			return "Created issue: office-abc";
		};

		const id = await createIdeaBead(runBd, "/office", {
			text: "Pool tour\nAdd a quick pool table tutorial for new staff.",
			author: "jeremy",
		});

		expect(id).toBe("office-abc");
		expect(cwd).toBe("/office");
		expect(args).toEqual([
			"create",
			"--title=idea: Pool tour",
			"--type=task",
			"--priority=3",
			"--silent",
			"--description=Who: jeremy\n\nIdea from the whiteboard:\nPool tour\nAdd a quick pool table tutorial for new staff.",
		]);
	});

	it("does not report success if bd returns no issue id", async () => {
		const runBd: BdRunner = async () => "created";
		await expect(
			createIdeaBead(runBd, "/office", { text: "Idea", author: "jeremy" }),
		).rejects.toThrow("bd created an idea without returning its id");
	});
});
