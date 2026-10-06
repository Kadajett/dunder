import { addDecor, addDesk, addLabel, addZone, type ItemRef } from "@shared/layout/ops";
import { decorKinds, type Layout } from "@shared/layout/schema";
import { useEdit } from "./edit-store";

/** Add an item at the room centre and select it. */
function add(kind: ItemRef["kind"], make: (layout: Layout) => Layout): void {
	const { draft, apply, select } = useEdit.getState();
	if (!draft) return;
	const next = make(draft);
	const list = { desk: next.desks, decor: next.decor, zone: next.zones, callout: next.callouts }[
		kind
	];
	const id = list.at(-1)?.id;
	apply(next);
	if (id) select({ kind, id });
}

/** Palette of things to add to the office. */
export function Palette() {
	return (
		<section className="edit-section" aria-label="Add">
			<header className="edit-section-head">
				<strong>Add</strong>
				<small>at the room centre</small>
			</header>
			<div className="edit-palette">
				<button type="button" data-primary onClick={() => add("desk", addDesk)}>
					Desk
				</button>
				<button type="button" data-primary onClick={() => add("zone", addZone)}>
					Zone (rug)
				</button>
				<button type="button" data-primary onClick={() => add("callout", addLabel)}>
					Label
				</button>
				{decorKinds.map((kind) => (
					<button key={kind} type="button" onClick={() => add("decor", (l) => addDecor(l, kind))}>
						{kind.charAt(0).toUpperCase() + kind.slice(1).replace("-", " ")}
					</button>
				))}
			</div>
		</section>
	);
}
