import type { Decor, DecorKind, Layout } from "@shared/layout/schema";
import { useHire } from "../../hire/hire-store";
import { useHud } from "../../hud/view-store";
import { DECOR } from "../decor";
import { Clickable } from "../interaction/Clickable";
import { useSelection } from "../interaction/selection-store";
import { DEG } from "./station";

/**
 * What clicking a piece of decor does, with its hover-ring radius. Items with
 * their own click behaviour (TV, bell) handle it inside the component.
 */
const ACTIONS: Partial<
	Record<DecorKind, { readonly ring: number; readonly opens: "card" | "brain" | "hire" }>
> = {
	"server-rack": { ring: 0.65, opens: "card" },
	"mail-cubby": { ring: 0.85, opens: "card" },
	// The library is the company brain: its shelves open the Brain panel.
	bookshelf: { ring: 1.15, opens: "brain" },
	// Reception is where new agents are hired.
	"reception-desk": { ring: 1.25, opens: "hire" },
};

function useDecorAction(item: Decor): (() => void) | undefined {
	const select = useSelection((state) => state.select);
	const togglePanel = useHud((state) => state.togglePanel);
	const showHire = useHire((state) => state.show);
	const action = ACTIONS[item.kind];
	if (!action) return undefined;
	if (action.opens === "brain") return () => togglePanel("brain");
	if (action.opens === "hire") return showHire;
	return () => select({ kind: "decor", id: item.id });
}

function DecorItem({ item }: { readonly item: Decor }) {
	const Item = DECOR[item.kind];
	const onSelect = useDecorAction(item);
	const ring = ACTIONS[item.kind]?.ring;
	const body = <Item {...(item.label ? { label: item.label } : {})} />;
	return (
		<group
			position={[item.position.x, item.elevation, item.position.z]}
			rotation={[0, item.rotation * DEG, 0]}
		>
			{onSelect ? (
				<Clickable {...(ring === undefined ? {} : { ring })} onSelect={onSelect}>
					{body}
				</Clickable>
			) : (
				body
			)}
		</group>
	);
}

/** Every decor item from the layout, placed and (where it does something) clickable. */
export function DecorItems({ layout }: { readonly layout: Layout }) {
	return (
		<>
			{layout.decor.map((item) => (
				<DecorItem key={item.id} item={item} />
			))}
		</>
	);
}
