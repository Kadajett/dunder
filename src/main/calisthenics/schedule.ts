import { z } from "zod";

/** Local wall-clock time of the daily workout, `HH:MM` (24 h). */
export const dailyTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/**
 * How long after the scheduled time a missed workout still runs (the app
 * started late, or the machine slept through it). Later than that, today is
 * skipped rather than compacting every agent at an unexpected hour.
 */
export const CATCH_UP_MINUTES = 120;

/** `YYYY-MM-DD` of `date` in local time: the key for "already ran today". */
export function localDateKey(date: Date): string {
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${date.getFullYear()}-${month}-${day}`;
}

function minutesOf(dailyTime: string): number {
	const [hours = 0, minutes = 0] = dailyTime.split(":").map(Number);
	return hours * 60 + minutes;
}

/** True when today's workout is due at `now` and has not run yet. */
export function isDailyDue(now: Date, dailyTime: string, lastRunDate: string | undefined): boolean {
	if (lastRunDate === localDateKey(now)) return false;
	const late = now.getHours() * 60 + now.getMinutes() - minutesOf(dailyTime);
	return late >= 0 && late <= CATCH_UP_MINUTES;
}
