import { randomUUID } from "node:crypto";
import type { AppError, AppErrorReport } from "@shared/app-errors";

/** Distinct errors kept; the oldest go first. */
export const ERRORS_KEPT = 50;

/** A stable identity for noisy resource failures with per-file subset URLs. */
function normalizedMessage(message: string): string {
	const firstLine = message.split("\n", 1)[0] ?? "";
	if (!/https?:\/\/|[a-f\d]{8,}/i.test(firstLine)) return firstLine;
	return firstLine
		.replace(/https?:\/\/\S+/g, "<url>")
		.replace(/\b[a-f\d]{8,}\b/gi, "<hash>")
		.replace(/\d+/g, "#");
}

function keyOf(report: Pick<AppErrorReport, "where" | "message">): string {
	return `${report.where}\n${normalizedMessage(report.message)}`;
}

export function isThirdPartyConsoleSource(sourceId: string | undefined): boolean {
	return Boolean(
		sourceId &&
			(sourceId.startsWith("http://") ||
				sourceId.startsWith("https://") ||
				sourceId.includes("/node_modules/")),
	);
}

/**
 * `log` with `report` recorded, newest first: a repeat bumps its count and
 * moves to the front instead of adding a line; past `ERRORS_KEPT` the oldest
 * are dropped. Returns whether it was new, so callers log each error once.
 */
export function recordError(
	log: readonly AppError[],
	report: AppErrorReport,
	now: number,
): { readonly log: AppError[]; readonly fresh: boolean } {
	const key = keyOf(report);
	const known = log.find((error) => keyOf(error) === key);
	const rest = log.filter((error) => error !== known);
	const entry: AppError = known
		? { ...known, count: known.count + 1, lastAt: now, stack: report.stack ?? known.stack }
		: {
				id: randomUUID(),
				message: report.message,
				stack: report.stack,
				where: report.where,
				count: 1,
				firstAt: now,
				lastAt: now,
			};
	return { log: [entry, ...rest].slice(0, ERRORS_KEPT), fresh: !known };
}

/**
 * The console messages worth an inbox item: app-source errors only, not
 * third-party sources or the "Uncaught …" echo already reported with a stack.
 */
export function consoleErrorWorthKeeping(
	level: string,
	message: string,
	sourceId?: string,
): boolean {
	return (
		level === "error" && !message.startsWith("Uncaught") && !isThirdPartyConsoleSource(sourceId)
	);
}
