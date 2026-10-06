import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { shQuote } from "./files.js";
import { isAppImageHeader, releaseFromGithub } from "./release.js";

const asset = (name: string, digest?: string | null) => ({
	name,
	browser_download_url: `https://github.com/Kadajett/dunder/releases/download/v0.3.0/${name}`,
	digest,
});

describe("releaseFromGithub", () => {
	it("picks the contract-named AppImage and its sha256 digest", () => {
		const sha = "a".repeat(64);
		const release = releaseFromGithub({
			tag_name: "v0.3.0",
			assets: [
				asset("dunder_0.3.0_amd64.deb"),
				asset("Dunder-0.3.0-linux-x86_64.AppImage", `sha256:${sha}`),
			],
		});
		expect(release).toEqual({
			version: "0.3.0",
			url: "https://github.com/Kadajett/dunder/releases/download/v0.3.0/Dunder-0.3.0-linux-x86_64.AppImage",
			sha256: sha,
			source: "github",
		});
	});

	it("has no release without the AppImage, and no checksum without a sha256 digest", () => {
		expect(
			releaseFromGithub({ tag_name: "v0.3.0", assets: [asset("latest.json")] }),
		).toBeUndefined();
		const plain = releaseFromGithub({
			tag_name: "v0.3.0",
			assets: [asset("Dunder-0.3.0-linux-x86_64.AppImage", null)],
		});
		expect(plain).not.toHaveProperty("sha256");
	});
});

describe("isAppImageHeader", () => {
	it("wants ELF magic plus the AppImage type-2 marker", () => {
		const elf = [0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0];
		expect(isAppImageHeader(new Uint8Array([...elf, 0x41, 0x49, 0x02, 0, 0, 0, 0, 0]))).toBe(true);
		expect(isAppImageHeader(new Uint8Array([...elf, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false);
		expect(isAppImageHeader(new TextEncoder().encode("<!doctype html><html>"))).toBe(false);
	});
});

describe("shQuote", () => {
	it("round-trips awkward paths through sh", () => {
		for (const value of ["/home/me/x", "/home/my name/it's $HOME", 'a"b`c']) {
			expect(execFileSync("sh", ["-c", `printf %s ${shQuote(value)}`], { encoding: "utf8" })).toBe(
				value,
			);
		}
	});
});
