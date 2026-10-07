/** The fields of an Excalidraw element the sticky hit-test reads. */
export interface BoardElement {
	readonly id: string;
	readonly type: string;
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
	readonly isDeleted?: boolean;
	readonly containerId?: string | null;
	readonly customData?: unknown;
}

const kindOf = (element: BoardElement): unknown =>
	element.customData && typeof element.customData === "object"
		? (element.customData as Record<string, unknown>)["kind"]
		: undefined;

const contains = (element: BoardElement, x: number, y: number): boolean =>
	x >= element.x &&
	x <= element.x + element.width &&
	y >= element.y &&
	y <= element.y + element.height;

/**
 * The sticky note (its text element) under a scene point, topmost first:
 * an agent's note is a rectangle with bound text, both tagged kind 'note'.
 * Right-clicking anywhere on the note counts, selected or not (a click
 * selects the rectangle, never the bound text).
 */
export function noteAt<T extends BoardElement>(
	elements: readonly T[],
	x: number,
	y: number,
): T | undefined {
	for (let index = elements.length - 1; index >= 0; index -= 1) {
		const element = elements[index];
		if (!element || element.isDeleted || element.type === "text" || !contains(element, x, y))
			continue;
		if (kindOf(element) !== "note") return undefined;
		return elements.find(
			(text) => text.type === "text" && text.containerId === element.id && !text.isDeleted,
		);
	}
	return undefined;
}

/** The fields tagging a note changes, beyond `BoardElement`. */
export interface Versioned extends BoardElement {
	readonly version: number;
	readonly versionNonce: number;
	readonly updated: number;
	readonly text?: string;
	readonly originalText?: string;
}

/**
 * The note's elements (`ids`: its text and rectangle) tagged with `beadId`:
 * '↗ <id>' under the text and `beadId` in their customData. Each gets a new
 * version, as Excalidraw's own edits do: the board sync saves only version
 * changes, so an untouched version would never reach main.
 */
export function tagNote<T extends Versioned>(
	elements: readonly T[],
	ids: ReadonlySet<string>,
	beadId: string,
	now: number,
): T[] {
	return elements.map((element) => {
		if (!ids.has(element.id)) return element;
		const data =
			element.customData && typeof element.customData === "object" ? element.customData : {};
		const text =
			element.type === "text" && element.text !== undefined
				? {
						text: `${element.text}\n↗ ${beadId}`,
						originalText: `${element.originalText ?? element.text}\n↗ ${beadId}`,
					}
				: {};
		return {
			...element,
			...text,
			customData: { ...data, beadId },
			version: element.version + 1,
			versionNonce: Math.floor(Math.random() * 2 ** 31),
			updated: now,
		};
	});
}
