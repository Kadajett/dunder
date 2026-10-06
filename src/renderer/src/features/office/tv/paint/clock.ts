import { dayOffset, isDaytime, WORLD_CITIES, type ZonedTime, zonedTime } from "../world-clock";
import { BODY_TOP, font, hhmm, INK, MARGIN, type Pen, type Point, SCREEN_W } from "./kit";

const GAP = 24;
const CARD_H = 540;
const RADIUS = 92;
const TAU = Math.PI * 2;
const SECOND_HAND = "#e0703f";

/** Point on the dial `turns` of the way round from 12 o'clock, `length` from the centre. */
function onDial([x, y]: Point, turns: number, length: number): Point {
	const angle = turns * TAU - Math.PI / 2;
	return [x + Math.cos(angle) * length, y + Math.sin(angle) * length];
}

function dial(pen: Pen, centre: Point, time: ZonedTime, day: boolean): void {
	pen.dot(centre, RADIUS, day ? "#f3ead9" : "#2a3142");
	const ink = day ? "#2c3036" : "#e8e2d4";
	for (let tick = 0; tick < 12; tick++) pen.dot(onDial(centre, tick / 12, RADIUS * 0.82), 4, ink);
	const hourTurns = ((time.hours % 12) + time.minutes / 60) / 12;
	const minuteTurns = (time.minutes + time.seconds / 60) / 60;
	pen.line(centre, onDial(centre, hourTurns, RADIUS * 0.5), { color: ink, width: 9 });
	pen.line(centre, onDial(centre, minuteTurns, RADIUS * 0.74), { color: ink, width: 6 });
	const second = onDial(centre, time.seconds / 60, RADIUS * 0.8);
	pen.line(centre, second, { color: SECOND_HAND, width: 3 });
	pen.dot(centre, 7, SECOND_HAND);
}

function sunOrMoon(pen: Pen, [x, y]: Point, day: boolean, card: string): void {
	if (day) {
		pen.dot([x, y], 16, "#ffc94a");
		return;
	}
	pen.dot([x, y], 16, "#e8e2d4");
	pen.dot([x + 8, y - 6], 14, card);
}

function dayBadge(
	time: ZonedTime,
	home: ZonedTime,
): { readonly label: string; readonly away: boolean } {
	const offset = dayOffset(time.date, home.date);
	if (offset === 0) return { label: time.weekday, away: false };
	return { label: `${time.weekday} · ${offset > 0 ? "+" : ""}${offset} DAY`, away: true };
}

/** WORLD CLOCK: SF / NYC / London / Tokyo as day-or-night cards. */
export function paintClock(pen: Pen, now: number): void {
	const instant = new Date(now);
	const home = zonedTime(instant, WORLD_CITIES[0]?.timeZone ?? "UTC");
	const width = (SCREEN_W - MARGIN * 2 - GAP * (WORLD_CITIES.length - 1)) / WORLD_CITIES.length;
	WORLD_CITIES.forEach((city, index) => {
		const centre = MARGIN + index * (width + GAP) + width / 2;
		const time = zonedTime(instant, city.timeZone);
		const day = isDaytime(time);
		const card = day ? "#36465e" : "#1f2433";
		pen.panel([centre - width / 2, BODY_TOP, width, CARD_H], card, 22);
		dial(pen, [centre, BODY_TOP + 130], time, day);
		const centred = { color: INK.cream, align: "center" } as const;
		pen.text(city.name, [centre, BODY_TOP + 290], {
			...centred,
			font: font(800, 28, "ui"),
			maxWidth: width - 24,
		});
		pen.text(hhmm(time.hours, time.minutes), [centre, BODY_TOP + 380], {
			...centred,
			font: font(700, 76, "mono"),
		});
		const badge = dayBadge(time, home);
		pen.text(badge.label, [centre, BODY_TOP + 440], {
			...centred,
			font: font(700, 28, "mono"),
			color: badge.away ? "#f0b45a" : INK.dim,
		});
		sunOrMoon(pen, [centre, BODY_TOP + 494], day, card);
	});
}
