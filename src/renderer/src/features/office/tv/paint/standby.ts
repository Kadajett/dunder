import { font, INK, type Pen, type Point, SCREEN_H, SCREEN_W } from "./kit";

/** Painter frame period: the TV never repaints faster than this. */
export const STANDBY_FRAME_MS = 250;

const BARS = ["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0"];
const CASTELLATIONS = ["#0000c0", "#131313", "#c000c0", "#131313", "#00c0c0", "#131313", "#c0c0c0"];
const CAPTIONS = [
	"PLEASE STAND BY",
	"THE AGENTS ARE THINKING",
	"DO NOT ADJUST YOUR TERMINAL",
	"ALL SHEEP ACCOUNTED FOR",
];
const WOOL = "#fbf7ef";
const FACE = "#2c3036";
/** Fleece puffs: offset from the body centre and radius. */
const FLEECE: readonly (readonly [dx: number, dy: number, radius: number])[] = [
	[-44, 0, 34],
	[-16, -22, 38],
	[18, -24, 38],
	[46, -2, 32],
	[0, 14, 40],
	[-30, 22, 28],
	[30, 22, 28],
];

function bars(pen: Pen): void {
	const width = SCREEN_W / BARS.length;
	BARS.forEach((color, index) => {
		pen.rect([index * width, 0, width + 1, SCREEN_H * 0.68], color);
		pen.rect(
			[index * width, SCREEN_H * 0.68, width + 1, SCREEN_H * 0.08],
			CASTELLATIONS[index] ?? "#131313",
		);
	});
	pen.rect([0, SCREEN_H * 0.76, SCREEN_W, SCREEN_H * 0.24], "#101114");
}

/** The herdr mascot: a fluffy sheep whose legs trot on alternate frames. */
function sheep(pen: Pen, [x, y]: Point, frame: number): void {
	const swing = frame % 2 === 0 ? 6 : -6;
	[-38, -14, 14, 38].forEach((offset, leg) => {
		const legX = x + offset + (leg % 2 === 0 ? swing : -swing);
		pen.rect([legX - 6, y + 30, 12, 44], FACE);
	});
	for (const [dx, dy, radius] of FLEECE) pen.dot([x + dx, y + dy], radius, WOOL);
	pen.dot([x + 74, y - 18], 26, FACE);
	pen.dot([x + 82, y - 24], 5, WOOL);
	pen.dot([x + 60, y - 40], 10, FACE);
}

/** HERDR TV: a cosy colour-bar test card with a trotting sheep and a REC light. */
export function paintStandby(pen: Pen, now: number): void {
	const frame = Math.floor(now / STANDBY_FRAME_MS);
	const cx = SCREEN_W / 2;
	const cy = SCREEN_H * 0.4;
	bars(pen);
	pen.dot([cx, cy], 190, "#2d5277");
	pen.ring([cx, cy], 190, { color: INK.cream, width: 6 });
	sheep(pen, [cx - 10, cy - 30 + (frame % 2) * 3], frame);
	const centred = { color: INK.cream, align: "center" } as const;
	pen.text("herdr", [cx, cy + 112], { ...centred, font: font(800, 76, "ui") });
	const caption = CAPTIONS[Math.floor(now / 4_000) % CAPTIONS.length] ?? "";
	pen.text(caption, [cx, SCREEN_H - 92], { ...centred, font: font(700, 44, "mono") });
	const time = new Date(now);
	const timecode = [time.getHours(), time.getMinutes(), time.getSeconds(), frame % 4]
		.map((part) => String(part).padStart(2, "0"))
		.join(":");
	pen.text(timecode, [cx, SCREEN_H - 38], {
		...centred,
		font: font(400, 30, "mono"),
		color: INK.dim,
	});
	pen.panel([32, 30, 160, 64], "rgba(12, 13, 16, 0.85)", 12);
	if (frame % 4 < 2) pen.dot([66, 62], 15, "#ff3b30");
	pen.text("REC", [92, 76], { font: font(700, 40, "mono"), color: WOOL });
	const roll = ((frame * 18) % (SCREEN_H + 120)) - 120;
	pen.rect([0, roll, SCREEN_W, 120], "rgba(255, 255, 255, 0.06)");
}
