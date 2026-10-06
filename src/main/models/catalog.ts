import { execFile } from "node:child_process";
import type { ModelOption } from "@shared/models";
import { z } from "zod";

/** `omp models ls --json` prints the whole catalog; give a cold cache time to load. */
const CATALOG_TIMEOUT_MS = 30_000;

const catalogSchema = z.object({
	models: z.array(
		z.object({
			provider: z.string(),
			kind: z.string(),
			selector: z.string().min(1),
			name: z.string(),
			contextWindow: z.number(),
			thinking: z.array(z.string()).nullish(),
		}),
	),
});

/** The chat models in `omp models ls --json` output. Throws on anything malformed. */
export function parseCatalog(stdout: string): ModelOption[] {
	return catalogSchema
		.parse(JSON.parse(stdout))
		.models.filter((model) => model.kind === "chat")
		.map((model) => ({
			selector: model.selector,
			name: model.name,
			provider: model.provider,
			thinking: model.thinking ?? [],
			contextWindow: model.contextWindow,
		}));
}

/** Run `omp models ls --json` with a timeout. */
export function loadOmpCatalog(env: NodeJS.ProcessEnv = process.env): Promise<string> {
	const { promise, resolve, reject } = Promise.withResolvers<string>();
	const options = { env, timeout: CATALOG_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 };
	execFile("omp", ["models", "ls", "--json"], options, (error, stdout, stderr) => {
		if (error) reject(new Error(`omp models ls failed: ${stderr.trim() || error.message}`));
		else resolve(stdout);
	});
	return promise;
}

export interface ModelCatalog {
	/** Cached catalog; loaded on first use. */
	list(): Promise<readonly ModelOption[]>;
	/** Reload from omp, replacing the cache. */
	refresh(): Promise<readonly ModelOption[]>;
}

/** Caches one successful load; a failed load is forgotten so the next call retries. */
export function createModelCatalog(load: () => Promise<string>): ModelCatalog {
	let cached: Promise<readonly ModelOption[]> | undefined;
	const refresh = (): Promise<readonly ModelOption[]> => {
		const next = load().then(parseCatalog);
		cached = next;
		next.catch(() => {
			if (cached === next) cached = undefined;
		});
		return next;
	};
	return { list: () => cached ?? refresh(), refresh };
}
