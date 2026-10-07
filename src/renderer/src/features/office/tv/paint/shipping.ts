import type { ShippingStats } from "@shared/work-board";
import { BODY_TOP, font, INK, MARGIN, type Pen, SCREEN_H, SCREEN_W } from "./kit";

const SPLIT = 520;
const UP = "#4fd18b";
const DOWN = "#f0814a";

/** '25m', '2h 10m', '1d 3h'; '—' without a figure. */
export function formatSpan(ms: number | null): string {
	if (ms === null) return "—";
	const minutes = Math.max(0, Math.round(ms / 60_000));
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
	const days = Math.floor(hours / 24);
	return hours % 24 ? `${days}d ${hours % 24}h` : `${days}d`;
}

/** '~$1.40'; '—' without a figure. */
export function formatUsd(usd: number | null): string {
	if (usd === null) return "—";
	return usd >= 10 ? `~$${Math.round(usd)}` : `~$${usd.toFixed(2)}`;
}

/** 'yesterday 4 ▲' style: today's count against yesterday's. */
export function versus(stats: ShippingStats): { readonly text: string; readonly color: string } {
	const text = `yesterday ${stats.yesterday}`;
	if (stats.today > stats.yesterday) return { text: `${text}  ▲`, color: UP };
	if (stats.today < stats.yesterday) return { text: `${text}  ▼`, color: DOWN };
	return { text, color: INK.dim };
}

function paintToday(pen: Pen, stats: ShippingStats): void {
	pen.text(String(stats.today), [MARGIN, BODY_TOP + 200], {
		font: font(800, 210, "ui"),
		color: INK.cream,
	});
	const noun = stats.today === 1 ? "bead shipped today" : "beads shipped today";
	pen.text(noun, [MARGIN, BODY_TOP + 256], { font: font(600, 34, "ui"), color: INK.dim });
	const against = versus(stats);
	pen.text(against.text, [MARGIN, BODY_TOP + 316], {
		font: font(700, 34, "mono"),
		color: against.color,
	});
	pen.text("QUEUE", [MARGIN, BODY_TOP + 420], { font: font(700, 26, "mono"), color: INK.dim });
	pen.text(`${stats.ready} ready · ${stats.inReview} in review`, [MARGIN, BODY_TOP + 470], {
		font: font(700, 40, "ui"),
		color: INK.cream,
	});
}

function paintMedians(pen: Pen, stats: ShippingStats): void {
	const left = SPLIT + 24;
	const width = SCREEN_W - MARGIN - left;
	pen.text("TODAY'S MEDIANS", [left, BODY_TOP + 34], {
		font: font(700, 28, "mono"),
		color: INK.dim,
	});
	const rows = [
		{ label: "start → close", value: formatSpan(stats.leadMs) },
		{ label: "waiting in review", value: formatSpan(stats.reviewMs) },
		{ label: "AI cost per bead", value: formatUsd(stats.usd) },
	];
	rows.forEach((row, index) => {
		const top = BODY_TOP + 60 + index * 140;
		pen.panel([left, top, width, 124], INK.panel);
		pen.text(row.value, [left + 28, top + 70], { font: font(800, 64, "ui"), color: INK.cream });
		pen.text(row.label, [left + 28, top + 108], { font: font(500, 26, "mono"), color: INK.dim });
	});
}

/** SHIPPING: beads closed today against yesterday, today's medians, and the queue. */
export function paintShipping(pen: Pen, stats: ShippingStats | null): void {
	if (!stats) {
		pen.text("waiting for the work board…", [SCREEN_W / 2, SCREEN_H / 2 + 20], {
			font: font(700, 52, "ui"),
			color: INK.dim,
			align: "center",
		});
		return;
	}
	paintToday(pen, stats);
	paintMedians(pen, stats);
}
