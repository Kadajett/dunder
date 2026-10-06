import type { Sky } from "../weather-codes";
import type { Pen, Point } from "./kit";

const SUN = "#ffc94a";
const CLOUD = "#e9edf2";
const CLOUD_DARK = "#8d96a3";
const RAIN = "#6fb6ff";

function sun(pen: Pen, [x, y]: Point, radius: number): void {
	const stroke = { color: SUN, width: radius * 0.16 };
	for (let ray = 0; ray < 8; ray++) {
		const dx = Math.cos((ray / 8) * Math.PI * 2) * radius;
		const dy = Math.sin((ray / 8) * Math.PI * 2) * radius;
		pen.line([x + dx * 1.3, y + dy * 1.3], [x + dx * 1.65, y + dy * 1.65], stroke);
	}
	pen.dot([x, y], radius, SUN);
}

/** Puffy three-lobe cloud; `at` is the centre of its flat bottom. */
function cloud(pen: Pen, [x, y]: Point, width: number, color: string): void {
	const unit = width / 4;
	pen.dot([x - unit, y - unit * 0.8], unit * 0.95, color);
	pen.dot([x + unit * 0.3, y - unit * 1.35], unit * 1.3, color);
	pen.dot([x + unit * 1.4, y - unit * 0.75], unit * 0.85, color);
	pen.panel([x - unit * 2, y - unit * 0.9, unit * 4, unit * 0.9], color, unit * 0.45);
}

/** Three slanted rain streaks hanging from `at`. */
function streaks(pen: Pen, [x, y]: Point, size: number, length: number): void {
	const stroke = { color: RAIN, width: size * 0.05 };
	for (let i = -1; i <= 1; i++) {
		const sx = x + i * size * 0.28;
		pen.line([sx, y], [sx - length * 0.35, y + length], stroke);
	}
}

function fogBands(pen: Pen, [x, y]: Point, size: number): void {
	const stroke = { color: "#c7cdd5", width: size * 0.07 };
	[0.9, 0.7, 0.85].forEach((width, row) => {
		const offset = row % 2 === 0 ? -size * 0.08 : size * 0.1;
		const by = y + row * size * 0.14;
		pen.line([x - (size * width) / 2 + offset, by], [x + (size * width) / 2 + offset, by], stroke);
	});
}

function bolt(pen: Pen, [x, y]: Point, size: number): void {
	const s = size * 0.12;
	pen.polygon(
		[
			[x + s * 0.4, y],
			[x - s * 0.8, y + s * 1.6],
			[x, y + s * 1.6],
			[x - s * 0.5, y + s * 3],
			[x + s, y + s * 1.1],
			[x + s * 0.1, y + s * 1.1],
		],
		SUN,
	);
}

/** Weather picture centred on `at`, roughly `size` pixels across. */
export function paintSky(pen: Pen, sky: Sky, [x, y]: Point, size: number): void {
	const base = y + size * 0.18;
	const raised: Point = [x, base - size * 0.06];
	switch (sky) {
		case "clear":
			sun(pen, [x, y], size * 0.28);
			return;
		case "partly":
			sun(pen, [x + size * 0.16, y - size * 0.16], size * 0.22);
			cloud(pen, [x - size * 0.06, base + size * 0.1], size * 0.8, CLOUD);
			return;
		case "cloudy":
			cloud(pen, [x + size * 0.14, base - size * 0.12], size * 0.62, CLOUD_DARK);
			cloud(pen, [x - size * 0.06, base + size * 0.08], size * 0.82, CLOUD);
			return;
		case "fog":
			cloud(pen, [x, base - size * 0.08], size * 0.78, CLOUD_DARK);
			fogBands(pen, [x, base + size * 0.02], size);
			return;
		case "drizzle":
		case "rain":
			cloud(pen, raised, size * 0.84, CLOUD);
			streaks(pen, [x, base + size * 0.04], size, size * (sky === "rain" ? 0.3 : 0.14));
			return;
		case "snow":
			cloud(pen, raised, size * 0.84, CLOUD);
			for (let i = -1; i <= 1; i++)
				pen.dot([x + i * size * 0.26, base + size * 0.14], size * 0.04, CLOUD);
			return;
		case "storm":
			cloud(pen, raised, size * 0.84, CLOUD_DARK);
			bolt(pen, [x, base - size * 0.02], size);
			return;
	}
}
