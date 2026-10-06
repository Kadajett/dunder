import { noticePage } from "./pages/notice";
import type { ReleaseLookup } from "./release";

export interface SiteDeps {
	/** The repo-root install.sh, verbatim. */
	installScript: string;
	/** `owner/name` of the GitHub repository that hosts releases. */
	repo: string;
	/** Latest-release lookup (edge-cached in production). */
	latest: () => Promise<ReleaseLookup>;
}

const VERSION_PATTERN = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;
const ASSET_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._+-]*$/;
const RETRY_AFTER_S = "300";

const NOT_FOUND = {
	status: 404,
	title: "Wrong door",
	message: "That page isn't in this office. Maybe it's in the annex, next to accounting.",
} as const;

function unavailable(lookup: Exclude<ReleaseLookup, { status: "ready" }>): Response {
	const title = lookup.status === "none" ? "No release yet" : "Downloads are taking a break";
	return noticePage({
		status: 503,
		title,
		message: `${lookup.detail} Try again in a few minutes, or build from source on GitHub.`,
		headers: { "retry-after": RETRY_AFTER_S },
	});
}

async function latestJson(deps: SiteDeps): Promise<Response> {
	const lookup = await deps.latest();
	if (lookup.status === "ready") {
		return Response.json(lookup.manifest, {
			headers: { "cache-control": "public, max-age=60", "access-control-allow-origin": "*" },
		});
	}
	return Response.json(
		{ error: lookup.status === "none" ? "no-release" : "unavailable", message: lookup.detail },
		{ status: 503, headers: { "cache-control": "no-store", "retry-after": RETRY_AFTER_S } },
	);
}

async function latestDownload(deps: SiteDeps): Promise<Response> {
	const lookup = await deps.latest();
	if (lookup.status !== "ready") return unavailable(lookup);
	const location = lookup.manifest.assets["linux-x64"].appimage;
	return new Response(null, {
		status: 302,
		headers: { location, "cache-control": "public, max-age=60" },
	});
}

/** `/download/v/<version>/<asset>`: a pinned release asset, or undefined when malformed. */
function versionedDownload(deps: SiteDeps, pathname: string): Response | undefined {
	const [, version = "", asset = ""] = /^\/download\/v\/([^/]+)\/([^/]+)$/.exec(pathname) ?? [];
	const bare = VERSION_PATTERN.exec(version)?.[1];
	if (bare === undefined || !ASSET_PATTERN.test(asset)) return undefined;
	const location = `https://github.com/${deps.repo}/releases/download/v${bare}/${asset}`;
	return new Response(null, {
		status: 302,
		headers: { location, "cache-control": "public, max-age=86400" },
	});
}

async function dispatch(pathname: string, deps: SiteDeps): Promise<Response> {
	if (pathname === "/install.sh") {
		return new Response(deps.installScript, {
			headers: {
				"content-type": "text/x-shellscript; charset=utf-8",
				"cache-control": "no-cache, no-store, must-revalidate",
			},
		});
	}
	if (pathname === "/latest.json") return latestJson(deps);
	if (pathname === "/download/latest/linux-x64") return latestDownload(deps);
	return versionedDownload(deps, pathname) ?? noticePage(NOT_FOUND);
}

/** Everything the static assets (landing page, screenshot, icon) don't already answer. */
export async function route(request: Request, deps: SiteDeps): Promise<Response> {
	if (request.method !== "GET" && request.method !== "HEAD") {
		return new Response("Method not allowed\n", { status: 405, headers: { allow: "GET, HEAD" } });
	}
	const response = await dispatch(new URL(request.url).pathname, deps);
	if (request.method === "GET") return response;
	return new Response(null, { status: response.status, headers: response.headers });
}
