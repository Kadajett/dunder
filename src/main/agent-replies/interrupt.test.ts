import { describe, expect, it } from "vitest";
import { type InterruptDeps, interruptAgent, interruptPrompt } from "./interrupt";

function harness(stopsAfter: number, chief = "max") {
	const calls: string[] = [];
	const told: string[] = [];
	let escapes = 0;
	const deps: InterruptDeps = {
		cli: async (args) => {
			calls.push(args.join(" "));
			if (args[1] === "send-keys") escapes += 1;
			if (args[1] === "wait" && escapes < stopsAfter) throw new Error("timed out");
		},
		chiefName: () => chief,
		tell: async (agent, text) => {
			told.push(`${agent}: ${text}`);
		},
	};
	return { deps, calls, told };
}

describe("interruptPrompt", () => {
	it("says why, then asks where it got to", () => {
		expect(interruptPrompt(" burning money on retries. ")).toBe(
			"[Jeremy interrupted you] burning money on retries. Stop and report where you are: what you were doing, and anything left half done.",
		);
		expect(interruptPrompt("")).toBe(
			"[Jeremy interrupted you] Stop and report where you are: what you were doing, and anything left half done.",
		);
	});
});

describe("interruptAgent", () => {
	it("escapes, waits until it stops, prompts it and tells Max", async () => {
		const h = harness(1);
		expect(await interruptAgent(h.deps, "carl", "wrong file")).toEqual({ ok: true });
		expect(h.calls).toEqual([
			"agent send-keys carl esc",
			"agent wait carl --until idle --until done --until blocked --timeout 10000",
			`agent prompt carl ${interruptPrompt("wrong file")}`,
		]);
		expect(h.told).toEqual([
			"max: Jeremy interrupted carl: wrong file. It was asked to stop and report where it is.",
		]);
	});

	it("escapes a second time when the first doesn't stop it", async () => {
		const h = harness(2);
		expect(await interruptAgent(h.deps, "carl", "")).toEqual({ ok: true });
		expect(h.calls.filter((call) => call.includes("send-keys"))).toHaveLength(2);
		expect(h.told[0]).toContain("(no reason given)");
	});

	it("gives up without prompting when it won't stop, and doesn't tell Max about himself", async () => {
		const stuck = harness(9);
		expect(await interruptAgent(stuck.deps, "carl", "x")).toEqual({
			ok: false,
			reason: "carl didn't stop within 15 s; open its screen to see why",
		});
		expect(stuck.calls.some((call) => call.includes("prompt"))).toBe(false);
		const chief = harness(1);
		await interruptAgent(chief.deps, "max", "x");
		expect(chief.told).toEqual([]);
	});
});
