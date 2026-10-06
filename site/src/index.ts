import installScript from "../../install.sh";
import { cachedLookup } from "./cache";
import { fetchLatestRelease } from "./release";
import { route } from "./router";

interface Env {
	/** `owner/name` of the GitHub repository that hosts releases (wrangler.jsonc var). */
	GITHUB_REPO: string;
	/** Optional secret (`wrangler secret put GITHUB_TOKEN`) to lift GitHub's anonymous rate limit. */
	GITHUB_TOKEN?: string;
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const repo = env.GITHUB_REPO;
		return route(request, {
			installScript,
			repo,
			latest: () =>
				cachedLookup({
					cache: caches.default,
					key: new URL(`/__cache/latest-release/${repo}`, request.url).href,
					// Bound: the Workers runtime rejects `fetch` called with a foreign `this`.
					load: () =>
						fetchLatestRelease({ repo, token: env.GITHUB_TOKEN, fetcher: fetch.bind(globalThis) }),
					waitUntil: (promise) => ctx.waitUntil(promise),
				}),
		});
	},
};
