import { avatarStyleFor } from "@shared/avatar/style";
import type { Harness, RosterAgent } from "@shared/company/roster";
import { describe, expect, it } from "vitest";
import { harnessArgs, resumeRef } from "./harness";

const ID = "01a1124a-4710-7466-8205-712b37cf9d8d";

function worker(harness: Harness, extra: Partial<RosterAgent> = {}): RosterAgent {
	return {
		id: "x",
		name: "kim",
		style: avatarStyleFor("kim"),
		role: "backend",
		harness,
		workspaceLabel: "sales",
		cwd: "/work",
		createdAt: new Date(0).toISOString(),
		...extra,
	};
}

const launch = (agent: RosterAgent, resume?: string) =>
	harnessArgs({ agent, promptPath: "/p/kim.md", prompt: 'line "one"\nline two', resume });

describe("harnessArgs", () => {
	it("runs omp in yolo mode with the prompt file, model and session", () => {
		expect(launch(worker("omp", { model: "anthropic/x:high" }), "/s/kim.jsonl")).toEqual([
			"--approval-mode=yolo",
			"--append-system-prompt=/p/kim.md",
			"--model=anthropic/x:high",
			"--resume=/s/kim.jsonl",
		]);
	});

	it("runs claude without permission prompts, appending the prompt file", () => {
		expect(launch(worker("claude"))).toEqual([
			"--dangerously-skip-permissions",
			"--append-system-prompt-file",
			"/p/kim.md",
		]);
		expect(launch(worker("claude", { model: "opus" }), ID).slice(3)).toEqual([
			"--model",
			"opus",
			"--resume",
			ID,
		]);
	});

	it("runs codex unsandboxed with the prompt as one-line developer instructions", () => {
		const args = launch(worker("codex", { model: "gpt-5" }));
		expect(args).toEqual([
			"--dangerously-bypass-approvals-and-sandbox",
			"-c",
			'developer_instructions="line \\"one\\"\\nline two"',
			"--model",
			"gpt-5",
		]);
		expect(args.some((arg) => arg.includes("\n"))).toBe(false);
	});

	it("resumes codex through its resume subcommand", () => {
		expect(launch(worker("codex"), ID).slice(0, 3)).toEqual([
			"resume",
			ID,
			"--dangerously-bypass-approvals-and-sandbox",
		]);
	});
});

describe("resumeRef", () => {
	const exists = (path: string) => path !== "/gone.jsonl";

	it("resumes an omp session file only while it exists", () => {
		expect(resumeRef(worker("omp", { lastSessionPath: "/s/kim.jsonl" }), exists)).toBe(
			"/s/kim.jsonl",
		);
		expect(resumeRef(worker("omp", { lastSessionPath: "/gone.jsonl" }), exists)).toBeUndefined();
		expect(resumeRef(worker("omp"), exists)).toBeUndefined();
	});

	it("resumes claude and codex by the session id herdr reported", () => {
		expect(resumeRef(worker("claude", { lastSessionPath: ID }), exists)).toBe(ID);
		const rollout = `/c/sessions/2026/10/06/rollout-2026-10-06T17-37-00-${ID}.jsonl`;
		expect(resumeRef(worker("codex", { lastSessionPath: rollout }), exists)).toBe(ID);
		expect(resumeRef(worker("claude", { lastSessionPath: "/gone.jsonl" }), exists)).toBe(undefined);
		expect(resumeRef(worker("codex", { lastSessionPath: "not-a-session" }), exists)).toBe(
			undefined,
		);
	});
});
