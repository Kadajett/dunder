import type { NoteColor, WhiteboardScene } from "@shared/whiteboard";
import { z } from "zod";
import { addPost, EDITOR_AUTHOR, EMPTY_SCENE } from "./board-doc";

/**
 * Boards saved by the tldraw whiteboard (board file version 1) hold a tldraw
 * store snapshot. Reading it needs no tldraw: its notes and text shapes are
 * plain records with TipTap rich text. They come across as Excalidraw notes
 * and text at the same spots; drawings (pen, shapes, arrows) do not.
 */

/** tldraw's colour names the old board used for agents' notes. */
const COLORS: Readonly<Record<string, NoteColor>> = {
	yellow: "yellow",
	"light-green": "green",
	green: "green",
	"light-blue": "blue",
	blue: "blue",
	"light-red": "pink",
	red: "pink",
};

const shapeSchema = z.looseObject({
	typeName: z.literal("shape"),
	type: z.enum(["note", "text"]),
	parentId: z.string().startsWith("page:"),
	index: z.string(),
	x: z.number().finite(),
	y: z.number().finite(),
	props: z.looseObject({ richText: z.unknown(), color: z.string().optional() }),
	meta: z.looseObject({ author: z.string().optional() }).optional(),
});
type Shape = z.infer<typeof shapeSchema>;

/** Plain text of a tldraw rich text document (TipTap JSON): paragraphs on their own lines. */
export function plainText(node: unknown): string {
	if (typeof node !== "object" || node === null) return "";
	if ("text" in node && typeof node.text === "string") return node.text;
	const content = "content" in node && Array.isArray(node.content) ? node.content : [];
	const parts = content.map(plainText);
	return "type" in node && node.type === "doc" ? parts.join("\n") : parts.join("");
}

function shapesOf(snapshot: unknown): Shape[] {
	if (typeof snapshot !== "object" || snapshot === null || !("store" in snapshot)) return [];
	const store = snapshot.store;
	if (typeof store !== "object" || store === null) return [];
	return Object.values(store)
		.flatMap((record) => {
			const parsed = shapeSchema.safeParse(record);
			return parsed.success ? [parsed.data] : [];
		})
		.sort((a, b) => (a.index < b.index ? -1 : a.index > b.index ? 1 : 0));
}

/** The notes and text of a tldraw board snapshot, stacked as they were. */
export function importTldrawSnapshot(snapshot: unknown): WhiteboardScene {
	return shapesOf(snapshot).reduce<WhiteboardScene>((scene, shape) => {
		const text = plainText(shape.props.richText).trim();
		if (!text) return scene;
		const author = shape.meta?.author ?? EDITOR_AUTHOR;
		const color = COLORS[shape.props.color ?? ""] ?? "yellow";
		return addPost(scene, { kind: shape.type, author, text, color, x: shape.x, y: shape.y }).scene;
	}, EMPTY_SCENE);
}
