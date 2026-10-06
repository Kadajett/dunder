import type { DecorKind, Layout } from "@shared/layout/schema";
import { DECOR } from "../decor";
import { Clickable } from "../interaction/Clickable";
import { useSelection } from "../interaction/selection-store";
import { DEG } from "./station";

/**
 * Decor that opens a world card when clicked, with its hover-ring radius.
 * Items with their own click behaviour (TV, bell) handle it inside the component.
 */
const CARD_DECOR: Partial<Record<DecorKind, number>> = {
	"server-rack": 0.65,
	"mail-cubby": 0.85,
};

/** Every decor item from the layout, placed and (where it has a card) clickable. */
export function DecorItems({ layout }: { readonly layout: Layout }) {
	const select = useSelection((state) => state.select);
	return (
		<>
			{layout.decor.map((item) => {
				const Item = DECOR[item.kind];
				const ring = CARD_DECOR[item.kind];
				const body = <Item {...(item.label ? { label: item.label } : {})} />;
				return (
					<group
						key={item.id}
						position={[item.position.x, item.elevation, item.position.z]}
						rotation={[0, item.rotation * DEG, 0]}
					>
						{ring === undefined ? (
							body
						) : (
							<Clickable ring={ring} onSelect={() => select({ kind: "decor", id: item.id })}>
								{body}
							</Clickable>
						)}
					</group>
				);
			})}
		</>
	);
}
