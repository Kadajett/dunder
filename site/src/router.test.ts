import { describe, expect, it } from "vitest";
import type { ReleaseLookup } from "./release";
import { route, type SiteDeps } from "./router";

const READY: ReleaseLookup = {
	status: "ready",
	manifest: {
		version: "0.2.0",
		tag: "v0.2.0",
		assets: {
			"linux-x64": {
				appimage:
					"https://github.com/Kadajett/dunder/releases/download/v0.2.0/Dunder-0.2.0-linux-x86_64.AppImage",
				deb: "https://github.com/Kadajett/dunder/releases/download/v0.2.0/dunder_0.2.0_amd64.deb",
			},
		},
	},
};
const NONE: ReleaseLookup = { status: "none", detail: "No Dunder release has been published yet." };

function deps(lookup: ReleaseLookup): SiteDeps {
	return {
		installScript: "#!/bin/sh\necho hi\n",
		repo: "Kadajett/dunder",
		latest: () => Promise.resolve(lookup),
	};
}

const get = (path: string, lookup: ReleaseLookup = READY, method = "GET"): Promise<Response> =>
	route(new Request(`https://dunder.yougotserved.dev${path}`, { method }), deps(lookup));

describe("site router", () => {
	it("serves install.sh verbatim as an uncached shell script", async () => {
		const response = await get("/install.sh");
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toMatch(/^text\/x-shellscript/);
		expect(response.headers.get("cache-control")).toContain("no-store");
		expect(await response.text()).toBe("#!/bin/sh\necho hi\n");
	});

	it("answers HEAD with headers but no body", async () => {
		const response = await get("/install.sh", READY, "HEAD");
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toMatch(/^text\/x-shellscript/);
		expect(await response.text()).toBe("");
	});

	it("rejects other methods", async () => {
		const response = await get("/install.sh", READY, "POST");
		expect(response.status).toBe(405);
		expect(response.headers.get("allow")).toBe("GET, HEAD");
	});

	it("serves latest.json in the release-asset shape", async () => {
		const response = await get("/latest.json");
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(READY.status === "ready" ? READY.manifest : undefined);
	});

	it("answers latest.json with a JSON 503 until a release exists", async () => {
		const response = await get("/latest.json", NONE);
		expect(response.status).toBe(503);
		expect(response.headers.get("retry-after")).toBe("300");
		expect(await response.json()).toEqual({ error: "no-release", message: NONE.detail });
	});

	it("tells a GitHub outage apart from a missing release", async () => {
		const response = await get("/latest.json", { status: "error", detail: "GitHub answered 403." });
		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({ error: "unavailable" });
	});

	it("redirects the latest linux-x64 download to the AppImage", async () => {
		const response = await get("/download/latest/linux-x64");
		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe(
			READY.status === "ready" ? READY.manifest.assets["linux-x64"].appimage : "",
		);
	});

	it("shows an HTML 503 page for the latest download before the first release", async () => {
		const response = await get("/download/latest/linux-x64", NONE);
		expect(response.status).toBe(503);
		expect(response.headers.get("content-type")).toMatch(/^text\/html/);
		expect(await response.text()).toContain("No release yet");
	});

	it.each([
		["0.1.0", "Dunder-0.1.0-linux-x86_64.AppImage"],
		["v0.1.0", "Dunder-0.1.0-linux-x86_64.AppImage"],
		["1.2.3-rc.1", "dunder_1.2.3-rc.1_amd64.deb"],
	])("redirects /download/v/%s/%s to the pinned release asset", async (version, asset) => {
		const response = await get(`/download/v/${version}/${asset}`, NONE);
		expect(response.status).toBe(302);
		const bare = version.replace(/^v/, "");
		expect(response.headers.get("location")).toBe(
			`https://github.com/Kadajett/dunder/releases/download/v${bare}/${asset}`,
		);
	});

	it.each([
		"/download/v/latest/Dunder.AppImage",
		"/download/v/0.1/Dunder.AppImage",
		"/download/v/0.1.0/..%2F..%2Fsecrets",
		"/download/v/0.1.0/.hidden",
		"/download/v/0.1.0",
		"/download/latest/linux-arm64",
		"/nope",
	])("404s malformed or unknown path %s", async (path) => {
		const response = await get(path);
		expect(response.status).toBe(404);
		expect(await response.text()).toContain("Wrong door");
	});
});
