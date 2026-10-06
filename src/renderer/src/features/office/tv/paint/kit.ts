import type { AgentStatus } from "@shared/herdr/schema";

/** Screen resolution of the TV's canvas texture (16:9). */
export const SCREEN_W = 1280;
export const SCREEN_H = 720;
export const MARGIN = 48;
/** Bottom of the header band; channel bodies start below it. */
export const BODY_TOP = 132;

export type Point = readonly [x: number, y: number];
export type Rect = readonly [x: number, y: number, width: number, height: number];

export const INK = {
	bg: "#1b1e24",
	bgLift: "#262a32",
	panel: "#2c313a",
	cream: "#f3ead9",
	dim: "#9aa3ad",
	faint: "#5d6570",
	osd: "#4fd18b",
} as const;

export const STATUS_INK: Record<AgentStatus, string> = {
	working: "#4fd18b",
	blocked: "#f0814a",
	done: "#6b9cf0",
	idle: "#c9c1b0",
	unknown: "#6a717c",
};

export interface TextStyle {
	readonly font: string;
	readonly color: string;
	readonly align?: CanvasTextAlign;
	/** Longer text is ellipsised to fit. */
	readonly maxWidth?: number;
}

export interface Stroke {
	readonly color: string;
	readonly width: number;
}

/** Canvas font shorthand for the app's bundled faces (loaded via @fontsource CSS). */
export function font(weight: number, px: number, family: "ui" | "mono"): string {
	const face = family === "ui" ? '"Inter", sans-serif' : '"JetBrains Mono", monospace';
	return `${weight} ${px}px ${face}`;
}

export function hhmm(hours: number, minutes: number): string {
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** The small drawing vocabulary the channels share, over one 2D canvas context. */
export class Pen {
	readonly #ctx: CanvasRenderingContext2D;

	constructor(ctx: CanvasRenderingContext2D) {
		this.#ctx = ctx;
	}

	rect([x, y, width, height]: Rect, color: string): void {
		this.#ctx.fillStyle = color;
		this.#ctx.fillRect(x, y, width, height);
	}

	/** Vertical gradient fill from `top` to `bottom` colour. */
	gradient([x, y, width, height]: Rect, top: string, bottom: string): void {
		const fill = this.#ctx.createLinearGradient(0, y, 0, y + height);
		fill.addColorStop(0, top);
		fill.addColorStop(1, bottom);
		this.#ctx.fillStyle = fill;
		this.#ctx.fillRect(x, y, width, height);
	}

	panel([x, y, width, height]: Rect, color: string, radius = 18): void {
		this.#ctx.fillStyle = color;
		this.#ctx.beginPath();
		this.#ctx.roundRect(x, y, width, height, radius);
		this.#ctx.fill();
	}

	dot([x, y]: Point, radius: number, color: string): void {
		this.#ctx.fillStyle = color;
		this.#ctx.beginPath();
		this.#ctx.arc(x, y, radius, 0, Math.PI * 2);
		this.#ctx.fill();
	}

	ring([x, y]: Point, radius: number, stroke: Stroke): void {
		this.#ctx.strokeStyle = stroke.color;
		this.#ctx.lineWidth = stroke.width;
		this.#ctx.beginPath();
		this.#ctx.arc(x, y, radius, 0, Math.PI * 2);
		this.#ctx.stroke();
	}

	/** Straight segment with round caps. */
	line(from: Point, to: Point, stroke: Stroke): void {
		this.#ctx.strokeStyle = stroke.color;
		this.#ctx.lineWidth = stroke.width;
		this.#ctx.lineCap = "round";
		this.#ctx.beginPath();
		this.#ctx.moveTo(from[0], from[1]);
		this.#ctx.lineTo(to[0], to[1]);
		this.#ctx.stroke();
	}

	polygon(points: readonly Point[], color: string): void {
		this.#ctx.fillStyle = color;
		this.#ctx.beginPath();
		for (const [x, y] of points) this.#ctx.lineTo(x, y);
		this.#ctx.closePath();
		this.#ctx.fill();
	}

	textWidth(value: string, fontSpec: string): number {
		this.#ctx.font = fontSpec;
		return this.#ctx.measureText(value).width;
	}

	text(value: string, [x, y]: Point, style: TextStyle): void {
		const ctx = this.#ctx;
		ctx.font = style.font;
		ctx.fillStyle = style.color;
		ctx.textAlign = style.align ?? "left";
		ctx.textBaseline = "alphabetic";
		const maxWidth = style.maxWidth ?? Number.POSITIVE_INFINITY;
		let shown = value;
		if (ctx.measureText(shown).width > maxWidth) {
			while (shown.length > 1 && ctx.measureText(`${shown}…`).width > maxWidth) {
				shown = shown.slice(0, -1);
			}
			shown = `${shown.trimEnd()}…`;
		}
		ctx.fillText(shown, x, y);
	}
}

/**
 * Shared channel chrome: dark backdrop, an accent strip, the channel's title
 * and the local time on the right.
 */
export function paintChrome(pen: Pen, title: string, accent: string, now: Date): void {
	pen.gradient([0, 0, SCREEN_W, SCREEN_H], INK.bgLift, INK.bg);
	pen.rect([0, 0, SCREEN_W, 12], accent);
	pen.dot([MARGIN + 12, 74], 12, accent);
	pen.text(title, [MARGIN + 40, 92], { font: font(800, 56, "ui"), color: INK.cream });
	pen.text(hhmm(now.getHours(), now.getMinutes()), [SCREEN_W - MARGIN, 90], {
		font: font(700, 44, "mono"),
		color: INK.dim,
		align: "right",
	});
}

/** Retro on-screen display shown right after a channel switch. */
export function paintBadge(pen: Pen, label: string): void {
	const style = { font: font(700, 46, "mono"), color: INK.osd };
	const width = pen.textWidth(label, style.font) + 56;
	const x = SCREEN_W - MARGIN - width;
	pen.panel([x, 28, width, 84], "#0a0c0f", 14);
	pen.text(label, [x + 28, 86], style);
}
