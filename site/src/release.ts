import { z } from "zod/mini";

const GITHUB_TIMEOUT_MS = 5_000;

/** Same shape as the `latest.json` asset attached to every GitHub release. */
export const LatestManifestSchema = z.object({
	version: z.string(),
	tag: z.string(),
	assets: z.object({
		"linux-x64": z.object({ appimage: z.url(), deb: z.url() }),
	}),
});
export type LatestManifest = z.infer<typeof LatestManifestSchema>;

export const ReleaseLookupSchema = z.discriminatedUnion("status", [
	z.object({ status: z.literal("ready"), manifest: LatestManifestSchema }),
	/** No published release yet, or the latest one is still missing its Linux assets. */
	z.object({ status: z.literal("none"), detail: z.string() }),
	/** GitHub could not be asked (timeout, rate limit, unexpected payload). Never cached. */
	z.object({ status: z.literal("error"), detail: z.string() }),
]);
export type ReleaseLookup = z.infer<typeof ReleaseLookupSchema>;

const GithubReleaseSchema = z.object({
	tag_name: z.string().check(z.minLength(1)),
	assets: z.array(z.object({ name: z.string(), browser_download_url: z.url() })),
});

export const appImageName = (version: string): string => `Dunder-${version}-linux-x86_64.AppImage`;
export const debName = (version: string): string => `dunder_${version}_amd64.deb`;

/** Turns a GitHub "latest release" payload into the latest.json manifest. */
export function lookupFromRelease(payload: unknown): ReleaseLookup {
	const parsed = GithubReleaseSchema.safeParse(payload);
	if (!parsed.success) {
		return { status: "error", detail: "GitHub returned an unexpected release payload." };
	}
	const { tag_name: tag, assets } = parsed.data;
	const version = tag.replace(/^v/, "");
	const urlOf = (name: string): string | undefined =>
		assets.find((asset) => asset.name === name)?.browser_download_url;
	const appimage = urlOf(appImageName(version));
	const deb = urlOf(debName(version));
	if (appimage === undefined || deb === undefined) {
		return { status: "none", detail: `Release ${tag} is still missing its Linux downloads.` };
	}
	return {
		status: "ready",
		manifest: { version, tag, assets: { "linux-x64": { appimage, deb } } },
	};
}

export interface ReleaseSource {
	/** `owner/name` of the GitHub repository. */
	repo: string;
	/** Optional token to lift GitHub's anonymous API rate limit. */
	token: string | undefined;
	fetcher: typeof fetch;
}

/** Asks the GitHub API for the latest published release of `source.repo`. */
export async function fetchLatestRelease(source: ReleaseSource): Promise<ReleaseLookup> {
	const headers: Record<string, string> = {
		accept: "application/vnd.github+json",
		"user-agent": "dunder-site (+https://dunder.yougotserved.dev)",
		"x-github-api-version": "2022-11-28",
	};
	if (source.token) headers["authorization"] = `Bearer ${source.token}`;
	const url = `https://api.github.com/repos/${source.repo}/releases/latest`;
	try {
		const response = await source.fetcher(url, {
			headers,
			signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
		});
		if (response.status === 404) {
			return { status: "none", detail: "No Dunder release has been published yet." };
		}
		if (!response.ok) {
			return { status: "error", detail: `GitHub answered ${response.status}.` };
		}
		return lookupFromRelease(await response.json());
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		return { status: "error", detail: `Could not reach GitHub (${reason}).` };
	}
}
