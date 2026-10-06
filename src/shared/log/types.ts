/** Severity, lowest first. */
export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type LogFields = Record<string, unknown>;

/** One emitted log line, after level filtering and error serialization. */
export interface LogRecord {
	time: Date;
	level: LogLevel;
	/** Colon-joined scope, e.g. `switchboard:mailbox`. */
	scope: string;
	message: string;
	fields?: LogFields;
}

/** Destination for log records: the console today, Sentry or a file later. */
export type LogSink = (record: LogRecord) => void;

/** An Error flattened to plain data so sinks can format or ship it. */
export interface SerializedError {
	name: string;
	message: string;
	stack?: string;
	cause?: unknown;
	[extra: string]: unknown;
}
