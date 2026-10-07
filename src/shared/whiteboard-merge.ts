/** What merging needs from an Excalidraw element. */
export interface Versioned {
	readonly id: string;
	readonly version: number;
	readonly versionNonce: number;
}

/** Excalidraw's reconcile rule (main uses the same): the higher version wins; on a tie, the lower nonce. */
function newer<E extends Versioned>(a: E, b: E): E {
	if (a.version !== b.version) return a.version > b.version ? a : b;
	return a.versionNonce <= b.versionNonce ? a : b;
}

/**
 * The editor's elements with `remote` merged in, element by element. Local
 * order is kept (it is the stacking order); elements only `remote` has go on
 * top, in its order. Deletions travel as `isDeleted` versions, so they merge
 * like any edit.
 */
export function mergeElements<E extends Versioned>(local: readonly E[], remote: readonly E[]): E[] {
	const incoming = new Map(remote.map((element) => [element.id, element]));
	const merged = local.map((element) => {
		const other = incoming.get(element.id);
		return other ? newer(element, other) : element;
	});
	const known = new Set(local.map((element) => element.id));
	return [...merged, ...remote.filter((element) => !known.has(element.id))];
}

/** Whether merging `remote` would change anything in `local`. */
export function changesScene<E extends Versioned>(
	local: readonly E[],
	remote: readonly E[],
): boolean {
	const current = new Map(local.map((element) => [element.id, element]));
	return remote.some((element) => {
		const mine = current.get(element.id);
		return !mine || newer(mine, element) !== mine;
	});
}
