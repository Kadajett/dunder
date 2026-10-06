import { consoleSink } from "./console-sink";
import {
	LOG_LEVELS,
	type LogFields,
	type LogLevel,
	type LogRecord,
	type LogSink,
	type SerializedError,
} from "./types";

export type { LogFields, LogLevel, LogRecord, LogSink, SerializedError } from "./types";
export { LOG_LEVELS } from "./types";

export interface Logger {
	readonly scope: string;
	debug(message: string, fields?: LogFields | Error): void;
	info(message: string, fields?: LogFields | Error): void;
	warn(message: string, fields?: LogFields | Error): void;
	error(message: string, fields?: LogFields | Error): void;
	/** A logger scoped under this one: `switchboard` → `switchboard:mailbox`. */
	child(scope: string): Logger;
}

/** How deep an error's `cause` chain is followed before it is cut off. */
const MAX_CAUSE_DEPTH = 5;

let minimumLevel: LogLevel = "info";
let sinks: readonly LogSink[] = [consoleSink];

/** Records below this level are dropped before reaching any sink. */
export function setLogLevel(level: LogLevel): void {
	minimumLevel = level;
}

export function getLogLevel(): LogLevel {
	return minimumLevel;
}

/** Replaces every sink at once; the default is the console sink alone. */
export function setLogSinks(next: readonly LogSink[]): void {
	sinks = [...next];
}

/** Reads a level name such as an env var; anything unknown yields undefined. */
export function parseLogLevel(value: string | undefined): LogLevel | undefined {
	const wanted = value?.trim().toLowerCase();
	return LOG_LEVELS.find((level) => level === wanted);
}

export function isLevelEnabled(level: LogLevel): boolean {
	return LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(minimumLevel);
}

/** Flattens an Error (and its cause chain) into plain data; other values pass through. */
export function serializeError(error: unknown, depth = 0): unknown {
	if (!(error instanceof Error)) return error;
	const serialized: SerializedError = { name: error.name, message: error.message };
	for (const [key, value] of Object.entries(error)) {
		const primitive = value === null || (typeof value !== "object" && typeof value !== "function");
		if (key !== "cause" && primitive) serialized[key] = value;
	}
	if (error.stack !== undefined) serialized.stack = error.stack;
	if (error.cause !== undefined) {
		serialized.cause =
			depth < MAX_CAUSE_DEPTH ? serializeError(error.cause, depth + 1) : String(error.cause);
	}
	return serialized;
}

function normalizeFields(fields: LogFields | Error | undefined): LogFields | undefined {
	if (fields === undefined) return undefined;
	if (fields instanceof Error) return { error: serializeError(fields) };
	const normalized: LogFields = {};
	for (const [key, value] of Object.entries(fields)) normalized[key] = serializeError(value);
	return normalized;
}

function emit(level: LogLevel, scope: string, message: string, fields?: LogFields | Error): void {
	if (!isLevelEnabled(level)) return;
	const record: LogRecord = { time: new Date(), level, scope, message };
	const normalized = normalizeFields(fields);
	if (normalized !== undefined) record.fields = normalized;
	for (const sink of sinks) sink(record);
}

export function createLogger(scope: string): Logger {
	return {
		scope,
		debug: (message, fields) => emit("debug", scope, message, fields),
		info: (message, fields) => emit("info", scope, message, fields),
		warn: (message, fields) => emit("warn", scope, message, fields),
		error: (message, fields) => emit("error", scope, message, fields),
		child: (name) => createLogger(`${scope}:${name}`),
	};
}
