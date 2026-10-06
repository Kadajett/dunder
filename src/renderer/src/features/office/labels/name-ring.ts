import type { AgentStatus } from "@shared/herdr/schema";

/**
 * The floor ring around an agent's feet, painted on a square canvas that maps
 * onto the ring mesh: the canvas half-width is the ring's outer radius. Canvas
 * "down" is turned toward the camera, so the name sits on the near arc and
 * reads left to right, upright.
 */
export const RING_CANVAS = 512;
/** World radius of the canvas edge (= the ring mesh's outer radius). */
export const RING_OUTER = 1;
/**
 * Where the name band runs, in canvas px from the centre. Sized so the
 * letters stay about as legible as the old 11px tags at the overview zoom.
 */
const BAND_RADIUS = 190;
const BAND_WIDTH = 120;
/** World radius of the band's inner edge: the ring mesh's hole. */
export const RING_INNER = ((BAND_RADIUS - BAND_WIDTH / 2) / (RING_CANVAS / 2)) * RING_OUTER;

const FONT_PX = 66;
const TRACKING = 0.12;
/**
 * The floor is seen at ~31° elevation, which squashes radial letter height to
 * about half; drawing letters taller pre-compensates on the near arc.
 */
const STRETCH = 1.85;
const DOT_RADIUS = 13;
const DOT_GAP = 24;
/** The name never wraps further than this around the ring (radians). */
const MAX_SWEEP = Math.PI * 1.2;

// The app's status tokens (styles.css), which a canvas can't read as CSS variables.
const STATUS_COLOR: Record<AgentStatus, string> = {
	idle: "#9a9488",
	working: "#3fae6a",
	blocked: "#e0703a",
	done: "#3f7be0",
	unknown: "#c9c2b4",
};

const INK = "#26231f";
const PAPER = "#fbf6ec";
const HIGHLIGHT = "#f2c66d";

export interface ArcLayout {
	/** Font scale applied so the name fits within MAX_SWEEP. */
	readonly scale: number;
	/** Canvas angle (y down, so π/2 is nearest the camera) of each advance's centre. */
	readonly angles: readonly number[];
	/** Angular half-width of the whole run. */
	readonly halfSweep: number;
}

/**
 * Lay advances (px along the arc) out at `radius`, centred on the near point
 * (angle π/2) and running left to right as seen from the camera; long names
 * shrink to fit within MAX_SWEEP.
 */
export function layoutArc(advances: readonly number[], radius: number): ArcLayout {
	const length = advances.reduce((sum, advance) => sum + advance, 0);
	const scale = Math.min(1, (MAX_SWEEP * radius) / length);
	const halfSweep = (length * scale) / 2 / radius;
	let along = 0;
	const angles = advances.map((advance) => {
		const centre = along + (advance * scale) / 2;
		along += advance * scale;
		return Math.PI / 2 + halfSweep - centre / radius;
	});
	return { scale, angles, halfSweep };
}

export interface RingLook {
	readonly name: string;
	readonly status: AgentStatus;
	/** Hovered or selected: the ring lights up. */
	readonly highlighted: boolean;
}

const fontFor = (px: number): string => `800 ${px}px "Inter", sans-serif`;

/** The font the ring needs loaded before its letters are right. */
export const RING_FONT = fontFor(FONT_PX);

const CENTRE = RING_CANVAS / 2;

/** Paints one agent's ring onto the canvas it owns (the ring mesh's texture). */
export class NameRingCanvas {
	readonly #ctx: CanvasRenderingContext2D;

	constructor(ctx: CanvasRenderingContext2D) {
		this.#ctx = ctx;
	}

	/** A status dot and the spaced capital name on the near arc, over a curved dark band. */
	paint(look: RingLook): void {
		const ctx = this.#ctx;
		ctx.clearRect(0, 0, RING_CANVAS, RING_CANVAS);
		ctx.font = RING_FONT;
		const letters = [...look.name.toUpperCase()];
		const tracking = FONT_PX * TRACKING;
		const advances = [
			DOT_RADIUS * 2 + DOT_GAP,
			...letters.map((letter) => ctx.measureText(letter).width + tracking),
		];
		const { scale, angles, halfSweep } = layoutArc(advances, BAND_RADIUS);
		this.#band(halfSweep, look.highlighted);
		const [dotAngle = Math.PI / 2, ...letterAngles] = angles;
		this.#atAngle(dotAngle, () => {
			ctx.beginPath();
			ctx.arc((-DOT_GAP / 2) * scale, 0, DOT_RADIUS * scale, 0, Math.PI * 2);
			ctx.fillStyle = STATUS_COLOR[look.status];
			ctx.fill();
		});
		ctx.font = fontFor(FONT_PX * scale);
		ctx.fillStyle = PAPER;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		letters.forEach((letter, index) => {
			this.#atAngle(letterAngles[index] ?? Math.PI / 2, () => {
				ctx.scale(1, STRETCH);
				ctx.fillText(letter, (-tracking / 2) * scale, 0);
			});
		});
	}

	#band(halfSweep: number, highlighted: boolean): void {
		const ctx = this.#ctx;
		// The thin full circle that makes it read as a ring on the floor.
		ctx.beginPath();
		ctx.arc(CENTRE, CENTRE, BAND_RADIUS, 0, Math.PI * 2);
		ctx.lineWidth = highlighted ? 10 : 7;
		ctx.strokeStyle = highlighted ? HIGHLIGHT : `${INK}8c`;
		ctx.stroke();
		// The dark curved pill the name sits in, like the reference's tags.
		const pad = BAND_WIDTH / 4 / BAND_RADIUS;
		ctx.beginPath();
		ctx.arc(
			CENTRE,
			CENTRE,
			BAND_RADIUS,
			Math.PI / 2 - halfSweep - pad,
			Math.PI / 2 + halfSweep + pad,
		);
		ctx.lineCap = "round";
		if (highlighted) {
			ctx.lineWidth = BAND_WIDTH + 12;
			ctx.strokeStyle = HIGHLIGHT;
			ctx.stroke();
		}
		ctx.lineWidth = BAND_WIDTH;
		ctx.strokeStyle = `${INK}ed`;
		ctx.stroke();
	}

	/** Draw at `angle` on the band, upright as seen from the camera. */
	#atAngle(angle: number, draw: () => void): void {
		const ctx = this.#ctx;
		ctx.save();
		ctx.translate(CENTRE + BAND_RADIUS * Math.cos(angle), CENTRE + BAND_RADIUS * Math.sin(angle));
		ctx.rotate(angle - Math.PI / 2);
		draw();
		ctx.restore();
	}
}
