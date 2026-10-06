import { claimDesks, updateZone, type ZonePatch } from "@shared/layout/ops-update";
import type { Zone } from "@shared/layout/schema";
import { useState } from "react";
import { bindWorkspace } from "./edit-actions";
import { useEdit } from "./edit-store";
import { applyField, NumberField, TextField } from "./fields";

/** Zone: its title, the herdr workspace its desks seat agents from, and its rug. */
export function ZoneInspector({ zone }: { readonly zone: Zone }) {
	const [binding, setBinding] = useState(false);
	const patch = (field: string, change: ZonePatch) =>
		applyField(field, (draft) => updateZone(draft, zone.id, change));
	const label = zone.workspaceLabel ?? "";
	const deskCount = useEdit(
		(state) => state.draft?.desks.filter((d) => d.zoneId === zone.id).length,
	);
	const bind = async () => {
		const trimmed = label.trim();
		if (!trimmed) return;
		patch("workspace", { workspaceLabel: trimmed });
		setBinding(true);
		await bindWorkspace(trimmed);
		setBinding(false);
	};
	return (
		<>
			<TextField label="Title" value={zone.title} onChange={(title) => patch("title", { title })} />
			<TextField
				label="herdr workspace"
				value={label}
				placeholder="unbound"
				onChange={(workspaceLabel) => patch("workspace", { workspaceLabel })}
				onBlur={() => patch("workspace", { workspaceLabel: label.trim() })}
			>
				<button type="button" disabled={!label.trim() || binding} onClick={bind}>
					{binding ? "Binding…" : "Bind"}
				</button>
			</TextField>
			<p className="edit-hint">
				{deskCount ?? 0} desk{deskCount === 1 ? "" : "s"} in this zone.{" "}
				<button
					type="button"
					className="edit-link"
					disabled={!zone.rug}
					onClick={() => applyField("claim", (draft) => claimDesks(draft, zone.id))}
				>
					Claim desks on the rug
				</button>
			</p>
			<div className="edit-grid">
				<NumberField
					label="Rug width"
					value={zone.rug?.width ?? 4}
					step={0.25}
					onChange={(rugWidth) => patch("rug-width", { rugWidth })}
				/>
				<NumberField
					label="Rug depth"
					value={zone.rug?.depth ?? 3}
					step={0.25}
					onChange={(rugDepth) => patch("rug-depth", { rugDepth })}
				/>
				<label className="edit-field edit-field-color">
					<span>Colour</span>
					<input
						type="color"
						value={zone.rug?.color ?? "#d9c7a5"}
						onChange={(event) => patch("rug-color", { rugColor: event.target.value })}
					/>
				</label>
			</div>
		</>
	);
}
