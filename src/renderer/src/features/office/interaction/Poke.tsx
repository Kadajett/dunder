import { useFrame } from "@react-three/fiber";
import { createContext, type ReactNode, type RefObject, useContext, useRef } from "react";
import type { Group } from "three";
import { pokeStrength, REACTION_SECONDS } from "./reaction";

/** `performance.now()` of the last click on the enclosing decor item; null until poked. */
export const PokeContext = createContext<RefObject<number | null> | null>(null);

/**
 * A group ref that reacts when the enclosing decor item is poked: `apply` runs every
 * frame of the reaction with its strength in [-1, 1], then once more with 0 to rest.
 * Outside a `PokeContext` (e.g. the edit-mode palette) nothing moves.
 */
export function usePokeReaction(
	apply: (group: Group, strength: number) => void,
): RefObject<Group | null> {
	const poked = useContext(PokeContext);
	const group = useRef<Group>(null);
	/** The poke already settled back to rest, so idle frames skip all work. */
	const rested = useRef<number | null>(null);
	useFrame(() => {
		const start = poked?.current;
		if (start == null || !group.current || rested.current === start) return;
		const elapsed = (performance.now() - start) / 1_000;
		apply(group.current, pokeStrength(elapsed));
		if (elapsed >= REACTION_SECONDS) rested.current = start;
	});
	return group;
}

/** The water cooler's glug: squash and stretch from the floor up, with a slight lean. */
function glug(target: Group, strength: number): void {
	target.scale.set(1 - 0.05 * strength, 1 + 0.08 * strength, 1 - 0.05 * strength);
	target.rotation.set(0, 0, 0.04 * strength);
}

/** Wraps a whole decor item that has no moving parts of its own, so a poke jiggles it. */
export function Jiggle({ children }: { readonly children: ReactNode }) {
	const group = usePokeReaction(glug);
	return <group ref={group}>{children}</group>;
}
