import { z } from "zod";

export const SITE = "https://dunder.yougotserved.dev";
export const SITE_MANIFEST_URL = `${SITE}/latest.json`;
export const SITE_DOWNLOAD_URL = `${SITE}/download/latest/linux-x64`;
export const GITHUB_REPO = "Kadajett/dunder";
export const GITHUB_LATEST_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

/** The AppImage of one Dunder release. */
export interface Release {
	readonly version: string;
	readonly url: string;
	/** Hex sha256 when the source publishes one (GitHub asset digests). */
	readonly sha256?: string;
	readonly source: "site" | "github";
}

export const siteManifestSchema = z.object({
	version: z.string().min(1).max(64),
	assets: z.object({
		"linux-x64": z.object({ appimage: z.url(), deb: z.url() }),
	}),
});

const githubAssetSchema = z.object({
	name: z.string(),
	browser_download_url: z.url(),
	digest: z.string().nullish(),
});
export const githubReleaseSchema = z.object({
	tag_name: z.string().min(1),
	assets: z.array(githubAssetSchema),
});
export type GithubRelease = z.infer<typeof githubReleaseSchema>;

export const appImageName = (version: string): string => `Dunder-${version}-linux-x86_64.AppImage`;

const SHA256_DIGEST = /^sha256:([0-9a-f]{64})$/;

/** The release's AppImage per the asset naming contract, or undefined when it has none. */
export function releaseFromGithub(release: GithubRelease): Release | undefined {
	const version = release.tag_name.replace(/^v/, "");
	const asset = release.assets.find((entry) => entry.name === appImageName(version));
	if (!asset) return undefined;
	const sha256 = asset.digest?.match(SHA256_DIGEST)?.[1];
	const base = { version, url: asset.browser_download_url, source: "github" } as const;
	return sha256 === undefined ? base : { ...base, sha256 };
}

/** The site names the version; the bytes come from its stable redirect. */
export function releaseFromSite(manifest: z.infer<typeof siteManifestSchema>): Release {
	return { version: manifest.version, url: SITE_DOWNLOAD_URL, source: "site" };
}

/** Bytes 0-3 are ELF's magic; 8-10 are AppImage type 2's `AI\x02`. */
export function isAppImageHeader(header: Uint8Array): boolean {
	const elf = [0x7f, 0x45, 0x4c, 0x46];
	const appImage = [0x41, 0x49, 0x02];
	return (
		elf.every((byte, index) => header[index] === byte) &&
		appImage.every((byte, index) => header[8 + index] === byte)
	);
}
