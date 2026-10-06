import { describe, expect, it } from "vitest";
import { externalUrl } from "./external-links";

describe("externalUrl", () => {
	it("lets web and mail links out", () => {
		expect(externalUrl("https://herdr.dev/docs")).toBe("https://herdr.dev/docs");
		expect(externalUrl("http://localhost:3000/")).toBe("http://localhost:3000/");
		expect(externalUrl("mailto:jeremy@example.com")).toBe("mailto:jeremy@example.com");
	});

	it("keeps everything else in", () => {
		for (const url of ["javascript:alert(1)", "file:///etc/passwd", "data:text/html,x", "nope"]) {
			expect(externalUrl(url)).toBeNull();
		}
	});
});
