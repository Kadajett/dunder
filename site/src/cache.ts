import { type ReleaseLookup, ReleaseLookupSchema } from "./release";

/** Seconds a found release stays in the edge cache. */
export const READY_TTL_S = 300;
/** Seconds "no release yet" stays cached, so a fresh release shows up quickly. */
export const NONE_TTL_S = 60;

/** The subset of the Workers Cache API this module needs. */
export interface LookupCache {
	match(key: string): Promise<Response | undefined>;
	put(key: string, response: Response): Promise<void>;
}

export interface CachedLookupOptions {
	cache: LookupCache;
	/** Absolute URL used as the cache key. */
	key: string;
	load: () => Promise<ReleaseLookup>;
	/** Keeps the cache write alive after the response is sent. */
	waitUntil: (promise: Promise<unknown>) => void;
}

async function readCached(cache: LookupCache, key: string): Promise<ReleaseLookup | undefined> {
	const hit = await cache.match(key);
	if (hit === undefined) return undefined;
	const parsed = ReleaseLookupSchema.safeParse(await hit.json().catch(() => undefined));
	return parsed.success ? parsed.data : undefined;
}

/** Memoizes a release lookup in the edge cache; errors are never cached. */
export async function cachedLookup(options: CachedLookupOptions): Promise<ReleaseLookup> {
	const { cache, key } = options;
	const cached = await readCached(cache, key).catch(() => undefined);
	if (cached !== undefined) return cached;
	const lookup = await options.load();
	if (lookup.status !== "error") {
		const ttl = lookup.status === "ready" ? READY_TTL_S : NONE_TTL_S;
		const entry = new Response(JSON.stringify(lookup), {
			headers: { "content-type": "application/json", "cache-control": `public, max-age=${ttl}` },
		});
		options.waitUntil(cache.put(key, entry).catch(() => undefined));
	}
	return lookup;
}
