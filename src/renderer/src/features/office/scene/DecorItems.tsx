import type { Decor, DecorKind, Layout } from "@shared/layout/schema";
import { useRef } from "react";
import { useHire } from "../../hire/hire-store";
import { DECOR } from "../decor";
import { Clickable } from "../interaction/Clickable";
import { Jiggle, PokeContext } from "../interaction/Poke";
import { useSelection } from "../interaction/selection-store";
import { DEG } from "./station";

/**
 * What clicking a piece of decor does, with its hover-ring radius. Items with
 * their own click behaviour (TV, bell) handle it inside the component.
 * `poke` items just react in place (plants rustle, the cooler jiggles).
 */
const ACTIONS: Partial<
	Record<DecorKind, { readonly ring: number; readonly opens: "card" | "hire" | "poke" }>
> = {
	"server-rack": { ring: 0.65, opens: "card" },
	"mail-cubby": { ring: 0.85, opens: "card" },
	// The library is the company brain: its shelves open the memories card.
	bookshelf: { ring: 1.15, opens: "card" },
	// Reception is where new agents are hired.
	"reception-desk": { ring: 1.25, opens: "hire" },
	plant: { ring: 0.32, opens: "poke" },
	"tall-plant": { ring: 0.42, opens: "poke" },
	"water-cooler": { ring: 0.38, opens: "poke" },
};

function useDecorAction(item: Decor, poke: () => void): (() => void) | undefined {
	const select = useSelection((state) => state.select);
	const showHire = useHire((state) => state.show);
	const action = ACTIONS[item.kind];
	if (!action) return undefined;
	if (action.opens === "hire") return showHire;
	if (action.opens === "poke") return poke;
	return () => select({ kind: "decor", id: item.id });
}

function DecorItem({ item }: { readonly item: Decor }) {
	const Item = DECOR[item.kind];
	const poked = useRef<number | null>(null);
	const onSelect = useDecorAction(item, () => {
		poked.current = performance.now();
	});
	const ring = ACTIONS[item.kind]?.ring;
	const shape = <Item {...(item.label ? { label: item.label } : {})} />;
	// Plants animate their own leaves; the cooler has no moving parts, so it jiggles whole.
	const body = item.kind === "water-cooler" ? <Jiggle>{shape}</Jiggle> : shape;
	return (
		<group
			position={[item.position.x, item.elevation, item.position.z]}
			rotation={[0, item.rotation * DEG, 0]}
		>
			<PokeContext.Provider value={poked}>
				{onSelect ? (
					<Clickable {...(ring === undefined ? {} : { ring })} onSelect={onSelect}>
						{body}
					</Clickable>
				) : (
					body
				)}
			</PokeContext.Provider>
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
