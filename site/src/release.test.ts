import { describe, expect, it, vi } from "vitest";
import { cachedLookup, type LookupCache } from "./cache";
import { fetchLatestRelease, lookupFromRelease, type ReleaseLookup } from "./release";

const asset = (name: string) => ({
	name,
	browser_download_url: `https://github.com/Kadajett/dunder/releases/download/v0.3.1/${name}`,
});

const fakeFetch = (respond: () => Promise<Response>): typeof fetch => vi.fn(respond);

describe("lookupFromRelease", () => {
	it("builds the latest.json manifest from the contract asset names", () => {
		const lookup = lookupFromRelease({
			tag_name: "v0.3.1",
			assets: [
				asset("latest.json"),
				asset("Dunder-0.3.1-linux-x86_64.AppImage"),
				asset("dunder_0.3.1_amd64.deb"),
			],
		});
		expect(lookup).toEqual({
			status: "ready",
			manifest: {
				version: "0.3.1",
				tag: "v0.3.1",
				assets: {
					"linux-x64": {
						appimage: asset("Dunder-0.3.1-linux-x86_64.AppImage").browser_download_url,
						deb: asset("dunder_0.3.1_amd64.deb").browser_download_url,
					},
				},
			},
		});
	});

	it("treats a release still missing its Linux assets as not released", () => {
		const lookup = lookupFromRelease({
			tag_name: "v0.3.1",
			assets: [asset("Dunder-0.3.1-linux-x86_64.AppImage")],
		});
		expect(lookup.status).toBe("none");
	});

	it("rejects payloads that are not a release", () => {
		expect(lookupFromRelease({ message: "Bad credentials" }).status).toBe("error");
	});
});

describe("fetchLatestRelease", () => {
	const source = (fetcher: typeof fetch, token?: string) => ({
		repo: "Kadajett/dunder",
		token,
		fetcher,
	});

	it("maps GitHub's 404 to 'no release yet'", async () => {
		const fetcher = fakeFetch(() => Promise.resolve(new Response("{}", { status: 404 })));
		expect((await fetchLatestRelease(source(fetcher))).status).toBe("none");
	});

	it("maps rate limits and network failures to errors", async () => {
		const limited = fakeFetch(() => Promise.resolve(new Response("{}", { status: 403 })));
		expect(await fetchLatestRelease(source(limited))).toEqual({
			status: "error",
			detail: "GitHub answered 403.",
		});
		const offline = fakeFetch(() => Promise.reject(new TypeError("network down")));
		expect((await fetchLatestRelease(source(offline))).status).toBe("error");
	});

	it("asks the latest-release endpoint, authenticated when a token is set", async () => {
		const fetcher = fakeFetch(() => Promise.resolve(new Response("{}", { status: 404 })));
		await fetchLatestRelease(source(fetcher, "secret"));
		const [url, init] = vi.mocked(fetcher).mock.calls[0] ?? [];
		expect(url).toBe("https://api.github.com/repos/Kadajett/dunder/releases/latest");
		expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret");
	});
});

describe("cachedLookup", () => {
	function memoryCache(): LookupCache & { entries: Map<string, Response> } {
		const entries = new Map<string, Response>();
		return {
			entries,
			match: (key) => Promise.resolve(entries.get(key)?.clone()),
			put: (key, response) => {
				entries.set(key, response);
				return Promise.resolve();
			},
		};
	}

	async function run(cache: LookupCache, result: ReleaseLookup) {
		const pending: Promise<unknown>[] = [];
		const load = vi.fn(() => Promise.resolve(result));
		const lookup = await cachedLookup({
			cache,
			key: "https://dunder.yougotserved.dev/__cache/latest",
			load,
			waitUntil: (promise) => pending.push(promise),
		});
		await Promise.all(pending);
		return { lookup, load };
	}

	it("serves a cached answer without asking GitHub again", async () => {
		const cache = memoryCache();
		const none: ReleaseLookup = { status: "none", detail: "No release." };
		await run(cache, none);
		expect(cache.entries.size).toBe(1);
		const second = await run(cache, { status: "error", detail: "unused" });
		expect(second.lookup).toEqual(none);
		expect(second.load).not.toHaveBeenCalled();
	});

	it("never caches errors", async () => {
		const cache = memoryCache();
		await run(cache, { status: "error", detail: "GitHub answered 500." });
		expect(cache.entries.size).toBe(0);
	});
});
