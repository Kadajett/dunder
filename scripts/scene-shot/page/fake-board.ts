import type { WhiteboardApi, WhiteboardBoard } from "@shared/whiteboard";
import {
	b64Vecs,
	createShapeId,
	createTLSchema,
	type TLDefaultColorStyle,
	type TLPageId,
	type TLRecord,
	type TLShape,
	toRichText,
} from "@tldraw/tlschema";
import type { IndexKey } from "@tldraw/utils";

/**
 * A brainstorm in progress, for the scene shots' whiteboard: a heading, three
 * agents' sticky notes, an arrow between two of them and a pen circle.
 */

const PAGE = "page:page" as TLPageId;
const schema = createTLSchema();
let order = 0;

function base(type: TLShape["type"], x: number, y: number) {
	order += 1;
	return {
		id: createShapeId(`sample-${order}`),
		typeName: "shape",
		type,
		x,
		y,
		rotation: 0,
		index: `a${order}` as IndexKey,
		parentId: PAGE,
		isLocked: false,
		opacity: 1,
		meta: {},
	} as const;
}

function note(text: string, color: TLDefaultColorStyle, x: number, y: number): TLShape {
	return {
		...base("note", x, y),
		type: "note",
		props: {
			color,
			richText: toRichText(text),
			size: "m",
			font: "sans",
			align: "middle",
			verticalAlign: "middle",
			labelColor: "black",
			growY: 0,
			fontSizeAdjustment: 1,
			url: "",
			scale: 1,
			textLastEditedBy: null,
		},
	};
}

function heading(text: string, x: number, y: number): TLShape {
	return {
		...base("text", x, y),
		type: "text",
		props: {
			color: "black",
			size: "xl",
			w: 8,
			font: "sans",
			textAlign: "start",
			autoSize: true,
			scale: 1,
			richText: toRichText(text),
		},
	};
}

function arrow(from: { x: number; y: number }, to: { x: number; y: number }): TLShape {
	return {
		...base("arrow", 0, 0),
		type: "arrow",
		props: {
			kind: "arc",
			labelColor: "black",
			color: "blue",
			fill: "none",
			dash: "draw",
			size: "m",
			arrowheadStart: "none",
			arrowheadEnd: "arrow",
			font: "draw",
			start: from,
			end: to,
			bend: 0,
			richText: toRichText(""),
			labelPosition: 0.5,
			scale: 1,
			elbowMidPoint: 0.5,
		},
	};
}

/** A hand-drawn ring around a note. */
function circle(x: number, y: number, radius: number): TLShape {
	const points = Array.from({ length: 40 }, (_, step) => {
		const angle = (step / 38) * Math.PI * 2;
		return { x: radius + Math.cos(angle) * radius, y: radius + Math.sin(angle) * radius * 0.9 };
	});
	return {
		...base("draw", x, y),
		type: "draw",
		props: {
			color: "red",
			fill: "none",
			dash: "draw",
			size: "m",
			segments: [{ type: "free", path: b64Vecs.encodePoints(points, 2), dim: 2 }],
			isComplete: true,
			isClosed: false,
			isPen: false,
			scale: 1,
			scaleX: 1,
			scaleY: 1,
		},
	};
}

const shapes: TLShape[] = [
	heading("Q4 launch: ideas", 60, 20),
	note("nora: demo day for the fintech CTO", "yellow", 60, 140),
	note("ava: ship the voice inbox first", "light-green", 340, 140),
	note("max: one owner per launch task", "light-blue", 620, 140),
	arrow({ x: 270, y: 240 }, { x: 330, y: 240 }),
	circle(310, 110, 130),
];

const page: TLRecord = {
	id: PAGE,
	typeName: "page",
	name: "Page 1",
	index: "a1" as IndexKey,
	meta: {},
};

export const SAMPLE_BOARD: WhiteboardBoard = {
	companyId: "dunder-mifflin",
	revision: 1,
	snapshot: {
		store: Object.fromEntries([page, ...shapes].map((record) => [record.id, record])),
		schema: schema.serialize(),
	},
};

/** `window.office.whiteboard` for the scene shots: the sample board, never changing. */
export const fakeWhiteboard: WhiteboardApi = {
	get: async () => SAMPLE_BOARD,
	put: async () => ({ state: "rejected", reason: "scene-shot", board: SAMPLE_BOARD }),
	onChanged: () => () => undefined,
};
