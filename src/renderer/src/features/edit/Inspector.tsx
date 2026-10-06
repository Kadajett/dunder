import { deleteItem, type ItemRef, rotateItem } from "@shared/layout/ops";
import { updateCallout, updateDecor, updateDesk } from "@shared/layout/ops-update";
import type { Desk, Layout } from "@shared/layout/schema";
import { useEdit } from "./edit-store";
import { applyField, TextField } from "./fields";
import { ZoneInspector } from "./ZoneInspector";

const KIND_LABEL: Record<ItemRef["kind"], string> = {
	desk: "Desk",
	decor: "Decor",
	zone: "Zone",
	callout: "Label",
};

function DeskInspector({ desk, layout }: { readonly desk: Desk; readonly layout: Layout }) {
	return (
		<>
			<TextField
				label="Pinned agent"
				value={desk.agentName ?? ""}
				placeholder={desk.reserved ? "your desk" : "anyone (seated by zone)"}
				onChange={(agentName) => applyField("agent", (d) => updateDesk(d, desk.id, { agentName }))}
			/>
			<label className="edit-field">
				<span>Zone</span>
				<select
					value={desk.zoneId ?? ""}
					onChange={(event) =>
						applyField("zone", (d) => updateDesk(d, desk.id, { zoneId: event.target.value }))
					}
				>
					<option value="">(shared desks)</option>
					{layout.zones.map((zone) => (
						<option key={zone.id} value={zone.id}>
							{zone.title}
							{zone.workspaceLabel ? ` · ${zone.workspaceLabel}` : ""}
						</option>
					))}
				</select>
			</label>
		</>
	);
}

function Fields({ layout, item }: { readonly layout: Layout; readonly item: ItemRef }) {
	const byId = <T extends { readonly id: string }>(list: readonly T[]) =>
		list.find((entry) => entry.id === item.id);
	if (item.kind === "zone") {
		const zone = byId(layout.zones);
		return zone ? <ZoneInspector zone={zone} /> : null;
	}
	if (item.kind === "desk") {
		const desk = byId(layout.desks);
		return desk ? <DeskInspector desk={desk} layout={layout} /> : null;
	}
	if (item.kind === "decor") {
		const decor = byId(layout.decor);
		if (!decor) return null;
		return (
			<TextField
				label={`Label (${decor.kind})`}
				value={decor.label ?? ""}
				onChange={(label) => applyField("label", (d) => updateDecor(d, decor.id, { label }))}
			/>
		);
	}
	const callout = byId(layout.callouts);
	if (!callout) return null;
	const patch = (field: string, change: { title?: string; subtitle?: string }) =>
		applyField(field, (d) => updateCallout(d, callout.id, change));
	return (
		<>
			<TextField
				label="Title"
				value={callout.title}
				onChange={(title) => patch("title", { title })}
			/>
			<TextField
				label="Subtitle"
				value={callout.subtitle ?? ""}
				onChange={(subtitle) => patch("subtitle", { subtitle })}
			/>
		</>
	);
}

/** Edits the selected item; R / Shift+R and Delete work from the keyboard too. */
export function Inspector() {
	const layout = useEdit((state) => state.draft);
	const item = useEdit((state) => state.selected);
	const apply = useEdit((state) => state.apply);
	const select = useEdit((state) => state.select);
	if (!layout || !item) {
		return <p className="edit-hint">Click a desk, decor item, zone rug or label to edit it.</p>;
	}
	return (
		<section className="edit-section" aria-label="Inspector">
			<header className="edit-section-head">
				<strong>{KIND_LABEL[item.kind]}</strong>
				<code>{item.id}</code>
			</header>
			<Fields layout={layout} item={item} />
			<div className="edit-actions">
				{item.kind === "callout" ? null : (
					<>
						<button
							type="button"
							title="Rotate left (R)"
							onClick={() => apply(rotateItem(layout, item, 1))}
						>
							⟲ Rotate
						</button>
						<button
							type="button"
							title="Rotate right (Shift+R)"
							onClick={() => apply(rotateItem(layout, item, -1))}
						>
							⟳
						</button>
					</>
				)}
				<button
					type="button"
					className="edit-danger"
					title="Delete (Del)"
					onClick={() => {
						apply(deleteItem(layout, item));
						select(null);
					}}
				>
					Delete
				</button>
			</div>
		</section>
	);
}
