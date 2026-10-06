import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { z } from "zod";
import {
	GITHUB_LATEST_URL,
	GITHUB_REPO,
	githubReleaseSchema,
	type Release,
	releaseFromGithub,
	releaseFromSite,
	SITE_MANIFEST_URL,
	siteManifestSchema,
} from "./release.js";

const JSON_TIMEOUT_MS = 10_000;
/** Covers a slow link: the AppImage is ~130 MB. */
const DOWNLOAD_TIMEOUT_MS = 20 * 60_000;
const HEADERS = { "User-Agent": "dunder-ai", Accept: "application/json" };

async function fetchJson<T>(url: string, schema: z.ZodType<T>): Promise<T> {
	const response = await fetch(url, {
		headers: HEADERS,
		signal: AbortSignal.timeout(JSON_TIMEOUT_MS),
	});
	if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
	return schema.parse(await response.json());
}

/** The GitHub release's AppImage digest, when GitHub has one; best effort. */
async function githubDigest(version: string): Promise<string | undefined> {
	const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/v${version}`;
	const release = await fetchJson(url, githubReleaseSchema).catch(() => undefined);
	return release && releaseFromGithub(release)?.sha256;
}

/**
 * The latest release: the site names it (with GitHub's digest when it has one),
 * GitHub's API is the fallback. Undefined when neither answers.
 */
export async function resolveLatest(): Promise<Release | undefined> {
	try {
		const release = releaseFromSite(await fetchJson(SITE_MANIFEST_URL, siteManifestSchema));
		const sha256 = await githubDigest(release.version);
		return sha256 === undefined ? release : { ...release, sha256 };
	} catch {
		const latest = await fetchJson(GITHUB_LATEST_URL, githubReleaseSchema).catch(() => undefined);
		return latest && releaseFromGithub(latest);
	}
}

export interface Downloaded {
	readonly bytes: number;
	readonly sha256: string;
}

/** Streams `url` (following redirects) into `path`, hashing as it goes. */
export async function download(
	url: string,
	path: string,
	onProgress: (bytes: number, total: number | undefined) => void,
): Promise<Downloaded> {
	const response = await fetch(url, {
		headers: { "User-Agent": "dunder-ai" },
		redirect: "follow",
		signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
	});
	if (!response.ok || !response.body) throw new Error(`${url}: HTTP ${response.status}`);
	const total = Number(response.headers.get("content-length")) || undefined;
	const hash = createHash("sha256");
	let bytes = 0;
	const meter = new Transform({
		transform(chunk: Buffer, _encoding, done) {
			hash.update(chunk);
			bytes += chunk.length;
			onProgress(bytes, total);
			done(null, chunk);
		},
	});
	const body = Readable.fromWeb(response.body);
	await pipeline(body, meter, createWriteStream(path, { mode: 0o644 }));
	return { bytes, sha256: hash.digest("hex") };
}
