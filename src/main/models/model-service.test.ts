import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agent, snapshot, workspace } from "@shared/herdr/fixtures/snapshot";
import type { AgentStatus } from "@shared/herdr/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createModelCatalog } from "./catalog";
import { ModelService } from "./model-service";

const catalogJson = JSON.stringify({
	models: [
		{
			provider: "anthropic",
			kind: "chat",
			selector: "anthropic/claude-opus-5-5",
			name: "Claude Opus 5.5",
			contextWindow: 1_000_000,
			thinking: ["low", "high"],
		},
		{
			provider: "openai-codex",
			kind: "chat",
			selector: "openai-codex/gpt-5.6-luna",
			name: "GPT-5.6-Luna",
			contextWindow: 272_000,
			thinking: ["low", "high"],
		},
	],
});
const modelLine = (model: string) => `${JSON.stringify({ type: "model_change", model })}\n`;

let dir = "";
let log = "";
let prompts: string[][] = [];
let persisted: string[] = [];
let service: ModelService;

function office(status: AgentStatus) {
	const ben = { ...agent("ben", "w2:p3", log), agent_status: status };
	return snapshot({ workspaces: [workspace("w2", "delivery")], agents: [ben] });
}

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "models-"));
	log = join(dir, "ben.jsonl");
	await writeFile(log, modelLine("anthropic/claude-opus-5-5"));
	prompts = [];
	persisted = [];
	service = new ModelService({
		cli: async (args) => {
			prompts.push([...args]);
			return { stdout: "{}", stderr: "" };
		},
		catalog: createModelCatalog(async () => catalogJson),
		persist: async (name, spec) => {
			persisted.push(`${name}=${spec}`);
		},
		onLive: () => {},
	});
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe("ModelService", () => {
	it("reports each live agent's model from its session log", async () => {
		service.update(office("idle"));
		await service.poll();
		expect(service.live()).toEqual({
			ben: { model: "anthropic/claude-opus-5-5", thinking: undefined },
		});
	});

	it("switches an idle agent at once and stays pending until the session records it", async () => {
		service.update(office("idle"));
		await service.poll();
		const result = await service.setModel("ben", "openai-codex/gpt-5.6-luna", "high");
		expect(result).toEqual({ state: "applied" });
		expect(persisted).toEqual(["ben=openai-codex/gpt-5.6-luna:high"]);
		expect(prompts).toEqual([["agent", "prompt", "ben", "/switch openai-codex/gpt-5.6-luna:high"]]);
		expect(service.live()["ben"]?.pending).toEqual({
			model: "openai-codex/gpt-5.6-luna",
			thinking: "high",
		});
		await appendFile(log, modelLine("openai-codex/gpt-5.6-luna"));
		await service.poll();
		expect(service.live()["ben"]).toEqual({
			model: "openai-codex/gpt-5.6-luna",
			thinking: undefined,
		});
	});

	it("queues a switch for a working or blocked agent and sends it once idle", async () => {
		service.update(office("working"));
		await service.poll();
		expect(await service.setModel("ben", "openai-codex/gpt-5.6-luna", undefined)).toMatchObject({
			state: "queued",
		});
		service.update(office("blocked"));
		expect(prompts).toEqual([]);
		expect(service.live()["ben"]?.pending?.model).toBe("openai-codex/gpt-5.6-luna");
		service.update(office("idle"));
		service.update(office("idle"));
		await service.poll();
		expect(prompts).toEqual([["agent", "prompt", "ben", "/switch openai-codex/gpt-5.6-luna"]]);
	});

	it("rejects unknown models, unsupported thinking and absent agents without touching anything", async () => {
		service.update(office("idle"));
		const results = [
			await service.setModel("ben", "anthropic/opus", undefined),
			await service.setModel("ben", "anthropic/claude-opus-5-5", "max"),
			await service.setModel("nora", "anthropic/claude-opus-5-5", "high"),
		];
		expect(results.map((r) => r.state)).toEqual(["rejected", "rejected", "rejected"]);
		expect(prompts).toEqual([]);
		expect(persisted).toEqual([]);
	});
});
