import type { WhiteboardSnapshot } from "@shared/whiteboard";
import type { PlacedShape } from "@shared/whiteboard-geometry";
import { plainText } from "@shared/whiteboard-text";
import { b64Vecs, type TLShape, type VecModel } from "@tldraw/tlschema";
import { FONT_PX, SOLID, STROKE_PX } from "./board-style";
import { boardShapes, fitView } from "./board-view";

type ShapeOf<Type extends TLShape["type"]> = Extract<TLShape, { type: Type }>;

const BOARD_WHITE = "#f8f7f3";
const NOTE_SIZE = 200;
const NOTE_PADDING = 16;
const LINE_HEIGHT = 1.35;
/** Highlighter ink: wide and see-through. */
const HIGHLIGHT = { widthFactor: 4, alpha: 0.35 } as const;
const ARROWHEAD = 4;

/** `hex` mixed toward white by `amount` (0–1): note and geo fills. */
function tint(hex: string, amount: number): string {
	const channel = (at: number): number => {
		const value = Number.parseInt(hex.slice(at, at + 2), 16);
		return Math.round(value + (255 - value) * amount);
	};
	return `rgb(${channel(1)} ${channel(3)} ${channel(5)})`;
}

interface Label {
	readonly text: string;
	readonly px: number;
	readonly color: string;
	/** The box the label is centred in (`middle`) or starts at (`start`), in shape units. */
	readonly box: { readonly w: number; readonly h: number };
	readonly align: "start" | "middle";
}

/**
 * A light painter for the board in the room: notes, text, geo shapes, pen
 * strokes, lines and arrows in tldraw's colours, close enough to read from
 * across the office. The editor overlay is the full-fidelity view.
 */
export class BoardPainter {
	readonly #ctx: CanvasRenderingContext2D;

	constructor(ctx: CanvasRenderingContext2D) {
		this.#ctx = ctx;
	}

	/** Paint the document over the whole `width` × `height` canvas. */
	paint(
		size: { readonly width: number; readonly height: number },
		snapshot: WhiteboardSnapshot | null,
	): void {
		const ctx = this.#ctx;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.fillStyle = BOARD_WHITE;
		ctx.fillRect(0, 0, size.width, size.height);
		const shapes = boardShapes(snapshot);
		if (shapes.length === 0) {
			this.#empty(size.width, size.height);
			return;
		}
		const view = fitView(
			shapes.map((placed) => placed.box),
			size.width,
			size.height,
		);
		ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		for (const placed of shapes) this.#placed(placed);
	}

	#empty(width: number, height: number): void {
		const ctx = this.#ctx;
		ctx.font = `600 ${Math.round(height * 0.07)}px Inter, system-ui, sans-serif`;
		ctx.fillStyle = "#c9c4b8";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText("Brainstorm board · click to draw", width / 2, height / 2);
	}

	#placed(placed: PlacedShape): void {
		const ctx = this.#ctx;
		ctx.save();
		ctx.translate(placed.x, placed.y);
		ctx.rotate(placed.shape.rotation);
		const drawn = this.#shape(placed.shape);
		ctx.restore();
		if (drawn) return;
		// Images, embeds and the like: their outline, so the board shows something is there.
		ctx.fillStyle = "#e4e2dc";
		ctx.fillRect(placed.box.x, placed.box.y, placed.box.w, placed.box.h);
	}

	/** Draw one shape in its own coordinates; false when there is no picture for its type. */
	#shape(shape: TLShape): boolean {
		switch (shape.type) {
			case "note":
				this.#note(shape);
				return true;
			case "text":
				this.#text(shape);
				return true;
			case "geo":
				this.#geo(shape);
				return true;
			case "draw":
			case "highlight":
				this.#freehand(shape);
				return true;
			case "line":
				this.#line(shape);
				return true;
			case "arrow":
				this.#arrow(shape);
				return true;
			case "frame":
				this.#frame(shape);
				return true;
			default:
				return false;
		}
	}

	#label(label: Label): void {
		const ctx = this.#ctx;
		if (!label.text.trim()) return;
		ctx.font = `600 ${label.px}px Inter, system-ui, sans-serif`;
		ctx.fillStyle = label.color;
		ctx.textBaseline = "top";
		const middle = label.align === "middle";
		ctx.textAlign = middle ? "center" : "left";
		const lines = this.#wrap(label.text, label.box.w);
		const step = label.px * LINE_HEIGHT;
		const top = middle ? (label.box.h - lines.length * step) / 2 : 0;
		const x = middle ? label.box.w / 2 : 0;
		for (const [row, line] of lines.entries()) ctx.fillText(line, x, top + row * step);
	}

	/** `text` wrapped greedily by word to `width` (current font), paragraph by paragraph. */
	#wrap(text: string, width: number): string[] {
		return text.split("\n").flatMap((paragraph) => {
			const lines: string[] = [];
			let line = "";
			for (const word of paragraph.split(/\s+/).filter(Boolean)) {
				const next = line ? `${line} ${word}` : word;
				if (line && this.#ctx.measureText(next).width > width) {
					lines.push(line);
					line = word;
				} else {
					line = next;
				}
			}
			return [...lines, line];
		});
	}

	#note(shape: ShapeOf<"note">): void {
		const ctx = this.#ctx;
		const { scale, growY, color, labelColor, size, richText } = shape.props;
		const w = NOTE_SIZE * scale;
		const h = (NOTE_SIZE + growY) * scale;
		ctx.fillStyle = "rgb(0 0 0 / 0.12)";
		ctx.fillRect(3 * scale, 5 * scale, w, h);
		ctx.fillStyle = tint(SOLID[color], 0.45);
		ctx.fillRect(0, 0, w, h);
		const pad = NOTE_PADDING * scale;
		ctx.save();
		ctx.translate(pad, pad);
		this.#label({
			text: plainText(richText),
			px: FONT_PX[size] * 0.9 * scale,
			color: SOLID[labelColor],
			box: { w: w - pad * 2, h: h - pad * 2 },
			align: "middle",
		});
		ctx.restore();
	}

	#text(shape: ShapeOf<"text">): void {
		const { scale, size, color, autoSize, w, richText } = shape.props;
		this.#label({
			text: plainText(richText),
			px: FONT_PX[size] * scale,
			color: SOLID[color],
			box: { w: autoSize ? Number.POSITIVE_INFINITY : w * scale, h: 0 },
			align: "start",
		});
	}

	#geo(shape: ShapeOf<"geo">): void {
		const ctx = this.#ctx;
		const { w, h, growY, scale, geo, fill, color, size, richText, labelColor } = shape.props;
		const width = w * scale;
		const height = (h + growY) * scale;
		ctx.beginPath();
		if (geo === "ellipse" || geo === "oval") {
			ctx.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
		} else {
			ctx.rect(0, 0, width, height);
		}
		if (fill !== "none") {
			ctx.fillStyle = tint(SOLID[color], 0.75);
			ctx.fill();
		}
		ctx.strokeStyle = SOLID[color];
		ctx.lineWidth = STROKE_PX[size] * scale;
		ctx.stroke();
		this.#label({
			text: plainText(richText),
			px: FONT_PX[size] * scale,
			color: SOLID[labelColor],
			box: { w: width, h: height },
			align: "middle",
		});
	}

	#frame(shape: ShapeOf<"frame">): void {
		const ctx = this.#ctx;
		ctx.strokeStyle = SOLID.grey;
		ctx.lineWidth = 2;
		ctx.strokeRect(0, 0, shape.props.w, shape.props.h);
		ctx.font = "600 16px Inter, system-ui, sans-serif";
		ctx.fillStyle = SOLID.grey;
		ctx.textBaseline = "bottom";
		ctx.textAlign = "left";
		ctx.fillText(shape.props.name || "Frame", 0, -6);
	}

	#polyline(points: readonly VecModel[]): void {
		const ctx = this.#ctx;
		const [first, ...rest] = points;
		if (!first) return;
		ctx.beginPath();
		ctx.moveTo(first.x, first.y);
		// A single dot still shows as a round cap.
		if (rest.length === 0) ctx.lineTo(first.x + 0.01, first.y);
		for (const point of rest) ctx.lineTo(point.x, point.y);
		ctx.stroke();
	}

	#freehand(shape: ShapeOf<"draw" | "highlight">): void {
		const ctx = this.#ctx;
		const { segments, scale, scaleX, scaleY, color, size } = shape.props;
		const highlight = shape.type === "highlight";
		ctx.save();
		ctx.globalAlpha = highlight ? HIGHLIGHT.alpha : 1;
		ctx.strokeStyle = SOLID[color];
		ctx.lineWidth = STROKE_PX[size] * scale * (highlight ? HIGHLIGHT.widthFactor : 1);
		for (const segment of segments) {
			const points = b64Vecs.decodePoints(segment.path, segment.dim);
			this.#polyline(
				points.map((point) => ({ x: point.x * scale * scaleX, y: point.y * scale * scaleY })),
			);
		}
		ctx.restore();
	}

	#line(shape: ShapeOf<"line">): void {
		const { points, scale, color, size } = shape.props;
		const ordered = Object.values(points).sort((a, b) => (a.index < b.index ? -1 : 1));
		this.#ctx.strokeStyle = SOLID[color];
		this.#ctx.lineWidth = STROKE_PX[size] * scale;
		this.#polyline(ordered.map((point) => ({ x: point.x * scale, y: point.y * scale })));
	}

	/** Straight from start to end (bends and bindings are left to the editor). */
	#arrow(shape: ShapeOf<"arrow">): void {
		const { start, end, color, size, scale, arrowheadStart, arrowheadEnd } = shape.props;
		const width = STROKE_PX[size] * scale;
		this.#ctx.strokeStyle = SOLID[color];
		this.#ctx.lineWidth = width;
		this.#polyline([start, end]);
		if (arrowheadEnd !== "none") this.#arrowhead(start, end, width);
		if (arrowheadStart !== "none") this.#arrowhead(end, start, width);
	}

	#arrowhead(from: VecModel, to: VecModel, width: number): void {
		const angle = Math.atan2(to.y - from.y, to.x - from.x);
		const length = width * ARROWHEAD;
		const wing = (side: number): VecModel => ({
			x: to.x - length * Math.cos(angle + side * 0.45),
			y: to.y - length * Math.sin(angle + side * 0.45),
		});
		this.#polyline([wing(-1), to, wing(1)]);
	}
}
