import { describe, expect, it } from "vitest";
import { editorNeedsLicense } from "./tldraw-license";

const FILE = { protocol: "file:", hostname: "" };

describe("editorNeedsLicense", () => {
	it("flags the installed app (production build over file://) without a key", () => {
		expect(editorNeedsLicense("", FILE, true)).toBe(true);
	});

	it("is satisfied by a key, a dev build, or tldraw's development origins", () => {
		expect(editorNeedsLicense("tldraw-key", FILE, true)).toBe(false);
		expect(editorNeedsLicense("", FILE, false)).toBe(false);
		expect(editorNeedsLicense("", { protocol: "http:", hostname: "127.0.0.1" }, true)).toBe(false);
		expect(editorNeedsLicense("", { protocol: "https:", hostname: "localhost" }, true)).toBe(false);
		expect(editorNeedsLicense("", { protocol: "https:", hostname: "example.com" }, true)).toBe(
			true,
		);
	});
});
