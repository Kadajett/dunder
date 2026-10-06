import type { LogFields, LogRecord, LogSink } from "./types";

const two = (value: number): string => String(value).padStart(2, "0");

/** `HH:MM:SS.mmm` in local time. */
export function formatTime(time: Date): string {
	const millis = String(time.getMilliseconds()).padStart(3, "0");
	return `${two(time.getHours())}:${two(time.getMinutes())}:${two(time.getSeconds())}.${millis}`;
}

/** JSON that survives cycles and bigints; error stacks are printed on their own lines instead. */
function stringifyFields(fields: LogFields): string {
	const seen = new WeakSet<object>();
	return JSON.stringify(fields, (key, value: unknown) => {
		if (key === "stack" && typeof value === "string") return undefined;
		if (typeof value === "bigint") return `${value}n`;
		if (typeof value === "object" && value !== null) {
			if (seen.has(value)) return "[Circular]";
			seen.add(value);
		}
		return value;
	});
}

/** Stacks of errors attached directly to the record's fields. */
function stacksOf(fields: LogFields): string[] {
	return Object.values(fields).flatMap((value) => {
		if (typeof value !== "object" || value === null || !("stack" in value)) return [];
		return typeof value.stack === "string" ? [value.stack] : [];
	});
}

/** One line per record: `HH:MM:SS.mmm LEVEL scope message {fields}`, then any error stacks. */
export function formatRecord(record: LogRecord): string {
	const level = record.level.toUpperCase().padEnd(5);
	const head = `${formatTime(record.time)} ${level} ${record.scope} ${record.message}`;
	if (record.fields === undefined) return head;
	const line = `${head} ${stringifyFields(record.fields)}`;
	return [line, ...stacksOf(record.fields)].join("\n");
}

/** The only code allowed to touch `console`; levels map 1:1 so devtools filtering works. */
export const consoleSink: LogSink = (record) => {
	const text = formatRecord(record);
	switch (record.level) {
		case "debug":
			console.debug(text);
			return;
		case "info":
			console.info(text);
			return;
		case "warn":
			console.warn(text);
			return;
		case "error":
			console.error(text);
			return;
	}
};
