import "./classic.css";
import { DEFAULT_LAYOUT } from "@shared/layout/default-layout";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { OfficeModel } from "../office/model/office-model";
import { ClassicTile } from "./ClassicTile";
import { classicTiles } from "./classic-tiles";
import { closeTile, NO_OPEN_TILES, openTile, pruneTiles, toggleWide } from "./open-tiles";

/**
 * The Classic view: a flat grid of the same agents and terminals as the 3D
 * office. Each tile previews its agent's live screen; clicking opens the real
 * terminal in place (several at once). Switching views unmounts this grid, so
 * a pane is never open here and in the 3D focus overlay together.
 */
export function ClassicView({ model }: { readonly model: OfficeModel }) {
	const tiles = useMemo(() => classicTiles(model, DEFAULT_LAYOUT.zones), [model]);
	const [open, setOpen] = useState(NO_OPEN_TILES);

	useEffect(() => {
		const live = new Set(tiles.map((tile) => tile.agent.paneId));
		setOpen((current) => pruneTiles(current, live));
	}, [tiles]);

	const onOpen = useCallback((paneId: string) => setOpen((o) => openTile(o, paneId)), []);
	const onClose = useCallback((paneId: string) => setOpen((o) => closeTile(o, paneId)), []);
	const onToggleWide = useCallback((paneId: string) => setOpen((o) => toggleWide(o, paneId)), []);

	return (
		<main className="classic-view" aria-label="Classic view">
			{tiles.length === 0 ? (
				<p className="classic-empty">No agents in the office session yet.</p>
			) : (
				<div className="classic-grid">
					{tiles.map((tile) => {
						const state = open.get(tile.agent.paneId);
						return (
							<ClassicTile
								key={tile.agent.paneId}
								tile={tile}
								open={state !== undefined}
								wide={state?.wide ?? false}
								onOpen={onOpen}
								onClose={onClose}
								onToggleWide={onToggleWide}
							/>
						);
					})}
				</div>
			)}
		</main>
	);
}
