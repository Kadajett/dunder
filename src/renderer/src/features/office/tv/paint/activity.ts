import type { ActivityItem, ActivityTone } from "../activity";
import { BODY_TOP, font, INK, MARGIN, type Pen, SCREEN_H, SCREEN_W, STATUS_INK } from "./kit";

const ROW_H = 92;
const TEXT_LEFT = MARGIN + 232;
export const ACTIVITY_ROWS = 6;

const TONE_INK: Record<ActivityTone, string> = {
	working: STATUS_INK.working,
	blocked: STATUS_INK.blocked,
	done: STATUS_INK.done,
	idle: STATUS_INK.idle,
	neutral: INK.faint,
};

function clockTime(at: number): string {
	const date = new Date(at);
	return [date.getHours(), date.getMinutes(), date.getSeconds()]
		.map((part) => String(part).padStart(2, "0"))
		.join(":");
}

/** ACTIVITY: the latest herdr events, newest on top. */
export function paintActivity(pen: Pen, items: readonly ActivityItem[]): void {
	if (items.length === 0) {
		pen.text("All quiet.", [SCREEN_W / 2, SCREEN_H / 2], {
			font: font(800, 64, "ui"),
			color: INK.dim,
			align: "center",
		});
		pen.text("the agents are thinking…", [SCREEN_W / 2, SCREEN_H / 2 + 60], {
			font: font(400, 34, "mono"),
			color: INK.faint,
			align: "center",
		});
		return;
	}
	items.slice(0, ACTIVITY_ROWS).forEach((item, row) => {
		const top = BODY_TOP + row * ROW_H;
		if (row === 0) pen.panel([MARGIN - 16, top, SCREEN_W - MARGIN * 2 + 32, ROW_H - 10], INK.panel);
		const baseline = top + 56;
		pen.text(clockTime(item.at), [MARGIN, baseline], {
			font: font(400, 30, "mono"),
			color: INK.dim,
		});
		pen.dot([MARGIN + 196, baseline - 11], 13, TONE_INK[item.tone]);
		pen.text(item.text, [TEXT_LEFT, baseline], {
			font: font(700, 40, "ui"),
			color: row === 0 ? INK.cream : "#d5cdbd",
			maxWidth: SCREEN_W - MARGIN - TEXT_LEFT,
		});
	});
}
