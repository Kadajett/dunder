import { SPOKEN_MAX } from "@shared/chief";
import { describe, expect, it } from "vitest";
import { capSpoken, splitSpoken } from "./spoken";

describe("splitSpoken", () => {
	it("takes the closing Spoken line out of the chat text", () => {
		const reply =
			"Handed **pf2** to theo.\n\n- ships today\n\nSpoken: Theo has it and it ships today.";
		expect(splitSpoken(reply)).toEqual({
			text: "Handed **pf2** to theo.\n\n- ships today",
			spoken: "Theo has it and it ships today.",
		});
	});

	it("leaves a reply without one untouched", () => {
		const reply = "Nothing to say aloud.\nspokenness is not a word";
		expect(splitSpoken(reply)).toEqual({ text: reply, spoken: null });
	});

	it("reads a spoken paragraph that wraps onto the next lines, and takes the last one", () => {
		const reply = [
			"Spoken: an interim line.",
			"Details `src/x.ts`.",
			"",
			"**Spoken:** Carl is on the board fix.",
			"It lands *tonight*, see [the bead](https://x).",
		].join("\n");
		expect(splitSpoken(reply)).toEqual({
			text: "Spoken: an interim line.\nDetails `src/x.ts`.",
			spoken: "Carl is on the board fix. It lands tonight, see the bead.",
		});
	});

	it("keeps text after a blank line that follows the spoken paragraph", () => {
		expect(splitSpoken("Spoken: Done.\n\nP.S. the log is in /tmp.")).toEqual({
			text: "P.S. the log is in /tmp.",
			spoken: "Done.",
		});
	});

	it("treats an empty Spoken line as none, but still drops it from the chat", () => {
		expect(splitSpoken("All set.\nSpoken:")).toEqual({ text: "All set.", spoken: null });
	});
});

describe("capSpoken", () => {
	it("keeps short lines whole", () => {
		expect(capSpoken("Short and sweet.")).toBe("Short and sweet.");
	});

	it("cuts a long line after its last whole sentence within the cap", () => {
		const sentence = "This sentence is exactly fifty characters long ok. ";
		const long = sentence.repeat(8).trim();
		const capped = capSpoken(long);
		expect(capped.length).toBeLessThanOrEqual(SPOKEN_MAX);
		expect(capped).toBe(sentence.repeat(5).trim());
	});

	it("cuts a run-on sentence at a word, marked with an ellipsis", () => {
		const capped = capSpoken(`One. ${"word ".repeat(100)}`);
		expect(capped.length).toBeLessThanOrEqual(SPOKEN_MAX);
		expect(capped.endsWith("word…")).toBe(true);
	});
});
