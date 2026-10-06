/** Classic tiles showing a live terminal, by pane id; `wide` spans the whole grid row. */
export type OpenTiles = ReadonlyMap<string, { readonly wide: boolean }>;

export const NO_OPEN_TILES: OpenTiles = new Map();

/** Opens a pane's terminal; a pane is open at most once, so reopening keeps its width. */
export function openTile(open: OpenTiles, paneId: string): OpenTiles {
	if (open.has(paneId)) return open;
	return new Map(open).set(paneId, { wide: false });
}

export function closeTile(open: OpenTiles, paneId: string): OpenTiles {
	if (!open.has(paneId)) return open;
	const next = new Map(open);
	next.delete(paneId);
	return next;
}

export function toggleWide(open: OpenTiles, paneId: string): OpenTiles {
	const tile = open.get(paneId);
	if (!tile) return open;
	return new Map(open).set(paneId, { wide: !tile.wide });
}

/** Forgets panes that are gone, so a recycled pane id never reopens a terminal by itself. */
export function pruneTiles(open: OpenTiles, livePanes: ReadonlySet<string>): OpenTiles {
	for (const paneId of open.keys()) {
		if (!livePanes.has(paneId)) {
			return new Map([...open].filter(([id]) => livePanes.has(id)));
		}
	}
	return open;
}
