import { createLogger, parseLogLevel, setLogLevel } from "@shared/log/logger";

/** Env var naming the minimum log level: debug, info, warn or error. */
export const LOG_LEVEL_ENV = "DUNDER_LOG_LEVEL";

/** Minimum level from `DUNDER_LOG_LEVEL`, else debug in dev and info when packaged. */
export function configureMainLogging(env: NodeJS.ProcessEnv, dev: boolean): void {
	const raw = env[LOG_LEVEL_ENV];
	const level = parseLogLevel(raw);
	setLogLevel(level ?? (dev ? "debug" : "info"));
	if (raw !== undefined && level === undefined) {
		createLogger("logging").warn(`ignoring unknown ${LOG_LEVEL_ENV}`, { value: raw });
	}
}
