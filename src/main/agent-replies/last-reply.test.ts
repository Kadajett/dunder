import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { lastTurnReply, readTail, TAIL_BYTES } from "./last-reply";
import { plainText } from "./plain-text";

type Part = { type: string; text?: string; thinking?: string; name?: string };
const entry = (role: string, content: string | Part[], timestamp = "2026-10-07T10:00:00.000Z") =>
	JSON.stringify({ type: "message", id: randomUUID(), timestamp, message: { role, content } });
const user = (text: string) => entry("user", [{ type: "text", text }]);
const said = (text: string, timestamp?: string) =>
	entry(
		"assistant",
		[
			{ type: "thinking", thinking: "hmm" },
			{ type: "text", text },
		],
		timestamp,
	);
const toolCall = () => entry("assistant", [{ type: "toolCall", name: "bash" }]);
const toolResult = () => entry("toolResult", [{ type: "text", text: "exit 0" }]);

describe("lastTurnReply", () => {
	it("takes the last assistant text of the last turn, past tool calls, results and thinking", () => {
		const lines = [
			user("do it"),
			said("Starting."),
			toolCall(),
			toolResult(),
			said("Done: shipped **office-x** in `a1b2c3`.", "2026-10-07T10:05:00.000Z"),
			toolCall(),
			toolResult(),
			JSON.stringify({ type: "custom", data: "x".repeat(50) }),
		];
		expect(lastTurnReply(lines)).toEqual({
			text: "Done: shipped office-x in a1b2c3.",
			at: Date.parse("2026-10-07T10:05:00.000Z"),
		});
	});

	it("has nothing when the last turn wrote no text, rather than an earlier turn's reply", () => {
		expect(
			lastTurnReply([user("one"), said("First answer"), user("two"), toolCall(), toolResult()]),
		).toBeNull();
		expect(lastTurnReply([])).toBeNull();
	});
});

describe("readTail", () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	});

	it("reads only the end of a huge log, dropping the line the cut lands in", async () => {
		const dir = mkdtempSync(join(tmpdir(), "tail-"));
		dirs.push(dir);
		const path = join(dir, "session.jsonl");
		const filler = toolResult().replace("exit 0", "y".repeat(10_000));
		const head = [user("old"), said("Old reply"), ...Array.from({ length: 200 }, () => filler)];
		writeFileSync(path, [...head, user("new"), said("New reply")].join("\n"));
		const tail = await readTail(path);
		expect(tail.size).toBeGreaterThan(TAIL_BYTES * 5);
		expect(tail.lines.join("\n").length).toBeLessThanOrEqual(TAIL_BYTES);
		expect(tail.lines.every((line) => line.startsWith("{"))).toBe(true);
		expect(lastTurnReply(tail.lines)?.text).toBe("New reply");
	});
});

describe("plainText", () => {
	it("reads markdown as plain text: code collapsed, markers gone, bullets kept", () => {
		const markdown = [
			"## Shipped",
			"",
			"- **Fixed** the [pool turn](https://x/y) in `service.ts`",
			"* *checked* with vitest",
			"> quoted",
			"",
			"```ts",
			"const a = 1;",
			"```",
			"",
			"",
			"---",
			"snake_case_name stays",
		].join("\n");
		expect(plainText(markdown)).toBe(
			[
				"Shipped",
				"",
				"• Fixed the pool turn in service.ts",
				"• checked with vitest",
				"quoted",
				"",
				"[code]",
				"",
				"snake_case_name stays",
			].join("\n"),
		);
	});

	it("collapses an unclosed code fence too", () => {
		expect(plainText("Before\n```\nlet x\nstill code")).toBe("Before\n[code]");
	});
});
