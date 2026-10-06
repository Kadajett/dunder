import { type OfficePulse, PULSE_STATUSES } from "../pulse";
import { BODY_TOP, font, INK, MARGIN, type Pen, SCREEN_H, SCREEN_W, STATUS_INK } from "./kit";

const SPLIT = 520;
const MAX_WORKSPACES = 4;

function paintTotals(pen: Pen, pulse: OfficePulse): void {
	pen.text(String(pulse.total), [MARGIN, BODY_TOP + 190], {
		font: font(800, 200, "ui"),
		color: INK.cream,
	});
	const noun = pulse.total === 1 ? "agent on the floor" : "agents on the floor";
	pen.text(noun, [MARGIN, BODY_TOP + 246], { font: font(600, 34, "ui"), color: INK.dim });
	const shown = PULSE_STATUSES.filter((status) => status !== "unknown" || pulse.byStatus.unknown);
	shown.forEach((status, row) => {
		const y = BODY_TOP + 316 + row * 60;
		const count = pulse.byStatus[status];
		pen.dot([MARGIN + 16, y - 13], 15, STATUS_INK[status]);
		pen.text(status, [MARGIN + 50, y], { font: font(600, 38, "ui"), color: INK.cream });
		pen.text(String(count), [SPLIT - 40, y], {
			font: font(700, 40, "mono"),
			color: count ? STATUS_INK[status] : INK.faint,
			align: "right",
		});
	});
}

function paintWorkspaces(pen: Pen, pulse: OfficePulse): void {
	const left = SPLIT + 24;
	const width = SCREEN_W - MARGIN - left;
	pen.text("BY WORKSPACE", [left, BODY_TOP + 34], { font: font(700, 28, "mono"), color: INK.dim });
	const rows = pulse.workspaces.slice(0, MAX_WORKSPACES);
	if (rows.length === 0) {
		pen.text("no workspaces yet", [left, BODY_TOP + 110], {
			font: font(600, 36, "ui"),
			color: INK.faint,
		});
		return;
	}
	rows.forEach((workspace, row) => {
		const top = BODY_TOP + 60 + row * 122;
		pen.panel([left, top, width, 106], INK.panel);
		pen.text(workspace.label, [left + 28, top + 50], {
			font: font(800, 40, "ui"),
			color: INK.cream,
			maxWidth: 330,
		});
		const working = workspace.statuses.filter((status) => status === "working").length;
		const summary = `${workspace.statuses.length} agents · ${working} working`;
		pen.text(summary, [left + 28, top + 88], { font: font(400, 26, "mono"), color: INK.dim });
		workspace.statuses.slice(0, 6).forEach((status, index) => {
			const x = left + width - 48 - index * 52;
			pen.panel([x - 20, top + 32, 40, 44], STATUS_INK[status], 10);
		});
	});
}

/** OFFICE PULSE: agent counts by status and by workspace. */
export function paintPulse(pen: Pen, pulse: OfficePulse | null): void {
	if (!pulse) {
		pen.text("waiting for herdr…", [SCREEN_W / 2, SCREEN_H / 2 + 20], {
			font: font(700, 56, "ui"),
			color: INK.dim,
			align: "center",
		});
		return;
	}
	paintTotals(pen, pulse);
	paintWorkspaces(pen, pulse);
}
