import { z } from "zod";
import type { HerdrApi } from "../herdr/api-client";
import type { PaneSize } from "./herdr-stream";

/** Used when the pane is missing from the layout or herdr cannot be asked. */
export const FALLBACK_PANE_SIZE: PaneSize = { cols: 120, rows: 36 };

const LOOKUP_TIMEOUT_MS = 5_000;

const layoutsSchema = z.object({
	snapshot: z.object({
		layouts: z.array(
			z.object({
				panes: z.array(
					z.object({
						pane_id: z.string(),
						rect: z.object({
							width: z.number().int().positive(),
							height: z.number().int().positive(),
						}),
					}),
				),
			}),
		),
	}),
});

async function fetchLayoutSizes(api: HerdrApi): Promise<Map<string, PaneSize>> {
	const { snapshot } = layoutsSchema.parse(await api.call("session.snapshot"));
	const sizes = new Map<string, PaneSize>();
	for (const layout of snapshot.layouts) {
		for (const { pane_id, rect } of layout.panes) {
			sizes.set(pane_id, { cols: rect.width, rows: rect.height });
		}
	}
	return sizes;
}

export type ResolvePaneSize = (paneId: string) => Promise<PaneSize>;

/**
 * A pane's "home" size: the cell rect herdr's layout gives it. Observe streams
 * render at this size, and a released control session restores it. Concurrent
 * lookups share one `session.snapshot` call.
 */
export function createPaneSizeResolver(api: Promise<HerdrApi>): ResolvePaneSize {
	let inflight: Promise<Map<string, PaneSize>> | undefined;
	const lookup = async (): Promise<Map<string, PaneSize>> => {
		const timeout = Promise.withResolvers<never>();
		const timer = setTimeout(() => timeout.reject(new Error("timed out")), LOOKUP_TIMEOUT_MS);
		try {
			return await Promise.race([api.then(fetchLayoutSizes), timeout.promise]);
		} finally {
			clearTimeout(timer);
		}
	};
	return async (paneId) => {
		inflight ??= lookup().finally(() => {
			inflight = undefined;
		});
		try {
			return (await inflight).get(paneId) ?? FALLBACK_PANE_SIZE;
		} catch {
			return FALLBACK_PANE_SIZE;
		}
	};
}
