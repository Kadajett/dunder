/**
 * Draws the Dunder app icon (a paper-white rounded square with a dark "D")
 * into `build/icon.png` and `build/icon.svg`, and the same SVG into the
 * installer (`packages/installer/src/icon-svg.ts`). No external assets: the
 * shapes are rasterized here with 4×4 supersampling and written as a plain PNG.
 *
 * Run: node scripts/icon/generate-icon.mts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";

const SIZE = 512;
const SAMPLES = 4;
const PAPER: Rgb = [244, 241, 234];
const EDGE: Rgb = [196, 188, 172];
const INK: Rgb = [31, 35, 40];

type Rgb = readonly [number, number, number];

/** The icon in a 512-unit square; the SVG and the raster share these numbers. */
const SHAPE = {
	inset: 24,
	radius: 104,
	border: 10,
	/** The D: stem from `left`, bowl centered at `bowlX`, half-height `half`, stroke `stroke`. */
	left: 142,
	bowlX: 242,
	bowlRx: 128,
	top: 116,
	half: 140,
	stroke: 62,
} as const;

function inRoundRect(x: number, y: number, inset: number, radius: number): boolean {
	const lo = inset + radius;
	const hi = SIZE - inset - radius;
	const dx = Math.max(lo - x, 0, x - hi);
	const dy = Math.max(lo - y, 0, y - hi);
	if (x < inset || x > SIZE - inset || y < inset || y > SIZE - inset) return false;
	return dx * dx + dy * dy <= radius * radius;
}

/** A filled D: straight stem on the left, elliptical bowl on the right. */
function inSolidD(x: number, y: number, grow: number): boolean {
	const { left, bowlX, bowlRx, top, half } = SHAPE;
	const cy = top + half;
	const h = half + grow;
	if (x < left - grow || Math.abs(y - cy) > h) return false;
	if (x <= bowlX) return true;
	const ex = (x - bowlX) / (bowlRx + grow);
	const ey = (y - cy) / h;
	return ex * ex + ey * ey <= 1;
}

function inLetter(x: number, y: number): boolean {
	return inSolidD(x, y, 0) && !inSolidD(x, y, -SHAPE.stroke);
}

/** Coverage-weighted color of one sample point, or undefined outside the icon. */
function sample(x: number, y: number): Rgb | undefined {
	if (!inRoundRect(x, y, SHAPE.inset, SHAPE.radius)) return undefined;
	if (inLetter(x, y)) return INK;
	const inner = SHAPE.inset + SHAPE.border;
	if (!inRoundRect(x, y, inner, SHAPE.radius - SHAPE.border)) return EDGE;
	return PAPER;
}

function pixel(px: number, py: number): [number, number, number, number] {
	let r = 0;
	let g = 0;
	let b = 0;
	let hits = 0;
	for (let sy = 0; sy < SAMPLES; sy++) {
		for (let sx = 0; sx < SAMPLES; sx++) {
			const color = sample(px + (sx + 0.5) / SAMPLES, py + (sy + 0.5) / SAMPLES);
			if (!color) continue;
			r += color[0];
			g += color[1];
			b += color[2];
			hits++;
		}
	}
	if (hits === 0) return [0, 0, 0, 0];
	const alpha = Math.round((hits / (SAMPLES * SAMPLES)) * 255);
	return [Math.round(r / hits), Math.round(g / hits), Math.round(b / hits), alpha];
}

function chunk(type: string, data: Buffer): Buffer {
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([length, body, crc]);
}

function renderPng(): Buffer {
	const stride = SIZE * 4 + 1;
	const raw = Buffer.alloc(stride * SIZE);
	for (let y = 0; y < SIZE; y++) {
		raw[y * stride] = 0;
		for (let x = 0; x < SIZE; x++) raw.set(pixel(x, y), y * stride + 1 + x * 4);
	}
	const header = Buffer.alloc(13);
	header.writeUInt32BE(SIZE, 0);
	header.writeUInt32BE(SIZE, 4);
	header.set([8, 6, 0, 0, 0], 8);
	const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	return Buffer.concat([
		signature,
		chunk("IHDR", header),
		chunk("IDAT", deflateSync(raw, { level: 9 })),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

function hex([r, g, b]: Rgb): string {
	return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function dPath(grow: number): string {
	const { left, bowlX, bowlRx, top, half } = SHAPE;
	const cy = top + half;
	const h = half + grow;
	const rx = bowlRx + grow;
	const x0 = left - grow;
	return `M${x0} ${cy - h}H${bowlX}A${rx} ${h} 0 0 1 ${bowlX} ${cy + h}H${x0}Z`;
}

function renderSvg(): string {
	const { inset, radius, border } = SHAPE;
	const side = SIZE - inset * 2;
	const inner = side - border * 2;
	return [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="Dunder">`,
		"<title>Dunder</title>",
		`<rect x="${inset}" y="${inset}" width="${side}" height="${side}" rx="${radius}" fill="${hex(EDGE)}"/>`,
		`<rect x="${inset + border}" y="${inset + border}" width="${inner}" height="${inner}" rx="${radius - border}" fill="${hex(PAPER)}"/>`,
		`<path fill="${hex(INK)}" fill-rule="evenodd" d="${dPath(0)}${dPath(-SHAPE.stroke)}"/>`,
		"</svg>",
		"",
	].join("\n");
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = join(root, "build");
const svg = renderSvg();
/** Single-quoted, as Biome formats it: the SVG has double quotes and no single ones. */
const svgLiteral = `'${JSON.stringify(svg).slice(1, -1).replaceAll('\\"', '"')}'`;
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "icon.png"), renderPng());
writeFileSync(join(outDir, "icon.svg"), svg);
writeFileSync(
	join(root, "packages", "installer", "src", "icon-svg.ts"),
	[
		"// Generated by scripts/icon/generate-icon.mts (`npm run icon`); do not edit.",
		"/** The Dunder icon the installer puts in the desktop's icon theme. */",
		`export const ICON_SVG =\n\t${svgLiteral};`,
		"",
	].join("\n"),
);
