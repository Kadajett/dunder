import type { ModelOption } from "@shared/models";
import { describe, expect, it } from "vitest";
import { checkModelRequest, deliveryFor, modelSpec } from "./switch-plan";

const opus: ModelOption = {
	selector: "anthropic/claude-opus-5-5",
	name: "Claude Opus 5.5",
	provider: "anthropic",
	thinking: ["low", "medium", "high"],
	contextWindow: 1_000_000,
};
const plain: ModelOption = {
	selector: "anthropic/claude-3-5-sonnet-20240620",
	name: "Claude Sonnet 3.5",
	provider: "anthropic",
	thinking: [],
	contextWindow: 200_000,
};
const catalog = [opus, plain];

describe("checkModelRequest", () => {
	it("accepts a catalog model with a supported thinking level, or none", () => {
		expect(checkModelRequest(catalog, opus.selector, "high")).toEqual({ ok: true, option: opus });
		expect(checkModelRequest(catalog, plain.selector, undefined)).toEqual({
			ok: true,
			option: plain,
		});
	});

	it("rejects unknown selectors and unsupported thinking levels", () => {
		expect(checkModelRequest(catalog, "anthropic/opus", undefined)).toMatchObject({ ok: false });
		expect(checkModelRequest(catalog, opus.selector, "max")).toEqual({
			ok: false,
			reason: "Claude Opus 5.5 thinking levels: low, medium, high (not max)",
		});
		expect(checkModelRequest(catalog, plain.selector, "low")).toMatchObject({ ok: false });
	});
});

describe("modelSpec", () => {
	it("appends the thinking level the way omp's --model and /switch expect", () => {
		expect(modelSpec(opus.selector, "high")).toBe("anthropic/claude-opus-5-5:high");
		expect(modelSpec(plain.selector, undefined)).toBe(plain.selector);
	});
});

describe("deliveryFor", () => {
	it("sends only to an agent waiting for a prompt", () => {
		expect(deliveryFor("ben", "idle")).toEqual({ kind: "send" });
		expect(deliveryFor("ben", "done")).toEqual({ kind: "send" });
		for (const status of ["working", "blocked", "unknown", undefined] as const) {
			expect(deliveryFor("ben", status).kind).toBe("wait");
		}
	});
});
