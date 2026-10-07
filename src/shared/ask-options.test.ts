import { describe, expect, it } from "vitest";
import { parseAskOptions } from "./ask-options";

const ask = (...options: string[]) =>
	`Rollback needs node_modules shared across builds.\n\nOptions:\n${options.map((option) => `- ${option}`).join("\n")}\n`;

describe("parseAskOptions", () => {
	it("takes 2-4 bullets after a final 'Options:' line, recommended first, and keeps the rest as the body", () => {
		expect(parseAskOptions(ask("Yes, drop Node 20", "No, keep Node 20"))).toEqual({
			body: "Rollback needs node_modules shared across builds.",
			options: ["Yes, drop Node 20", "No, keep Node 20"],
		});
		expect(parseAskOptions("Pick one\noptions:\n* A\n* B\n* C\n* D").options).toEqual([
			"A",
			"B",
			"C",
			"D",
		]);
	});

	it("offers nothing (and keeps the description whole) for none, one, five, a long option, or text after the bullets", () => {
		const whole = (detail: string) =>
			expect(parseAskOptions(detail)).toEqual({ body: detail.trim(), options: [] });
		whole("Just tell me what you think.");
		whole(ask("Only one"));
		whole(ask("A", "B", "C", "D", "E"));
		whole(ask("A", "x".repeat(121)));
		whole(`${ask("A", "B")}Thanks!`);
		whole("");
	});

	it("uses the last Options block when an earlier one is quoted in the text", () => {
		const detail = `Old ask said:\nOptions:\n- X\n- Y\nNow:\nOptions:\n- A\n- B`;
		expect(parseAskOptions(detail).options).toEqual(["A", "B"]);
	});
});
