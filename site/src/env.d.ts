// Minimal Workers runtime typings on top of lib.webworker (keeps the site free of a 10k-line
// generated types file).

declare module "*.sh" {
	const text: string;
	export default text;
}

interface CacheStorage {
	/** The colo-local edge cache of the zone the worker runs on. */
	readonly default: Cache;
}

interface ExecutionContext {
	waitUntil(promise: Promise<unknown>): void;
}
