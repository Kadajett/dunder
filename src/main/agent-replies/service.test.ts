import { randomUUID } from "node:crypto";
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agent, snapshot } from "@shared/herdr/fixtures/snapshot";
import type { AgentStatus } from "@shared/herdr/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentRepliesService } from "./service";

const T0 = Date.parse("2026-10-07T10:00:00.000Z");
let dir = "";

const line = (role: string, text: string, at: number) =>
	`${JSON.stringify({
		type: "message",
		id: randomUUID(),
		timestamp: new Date(at).toISOString(),
		message: { role, content: [{ type: "text", text }] },
	})}\n`;

function office(status: AgentStatus, kind = "omp") {
	return snapshot({
		agents: [
			{
				...agent("nora", "w1:p1"),
				agent: kind,
				agent_status: status,
				agent_session: { kind: "path", value: join(dir, "nora.jsonl") },
			},
		],
	});
}

describe("AgentRepliesService", () => {
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "replies-"));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it("gives a done agent's final reply, and follows the log as it grows", async () => {
		const log = join(dir, "nora.jsonl");
		writeFileSync(log, line("user", "go", T0) + line("assistant", "First done.", T0 + 1_000));
		const replies = new AgentRepliesService(() => T0 + 2_000);
		replies.update(office("done"));
		expect(await replies.lastReply("nora")).toEqual({ text: "First done.", at: T0 + 1_000 });
		appendFileSync(
			log,
			line("user", "again", T0 + 3_000) + line("assistant", "Second.", T0 + 4_000),
		);
		expect((await replies.lastReply("nora"))?.text).toBe("Second.");
	});

	it("shows nothing for a reply older than the turn main saw start", async () => {
		let now = T0;
		const replies = new AgentRepliesService(() => now);
		// The log's last text is from long before this turn started (its user line fell out of the tail, say).
		writeFileSync(join(dir, "nora.jsonl"), line("assistant", "Yesterday's news.", T0 - 86_400_000));
		replies.update(office("idle"));
		now = T0 + 60_000;
		replies.update(office("working"));
		now = T0 + 120_000;
		replies.update(office("done"));
		expect(await replies.lastReply("nora")).toBeNull();
	});

	it("has no reply for agents without an omp session log, or unknown names", async () => {
		writeFileSync(join(dir, "nora.jsonl"), line("assistant", "Hi", T0));
		const replies = new AgentRepliesService(() => T0);
		replies.update(office("done", "claude"));
		expect(await replies.lastReply("nora")).toBeNull();
		replies.update(office("done"));
		expect(await replies.lastReply("ghost")).toBeNull();
		rmSync(join(dir, "nora.jsonl"));
		expect(await replies.lastReply("nora")).toBeNull();
	});
});
