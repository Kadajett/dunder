import type { AppError, AppErrorReport } from "@shared/app-errors";
import { createLogger } from "@shared/log/logger";
import type { WebContents } from "electron";
import { consoleErrorWorthKeeping, recordError } from "./error-log";

const log = createLogger("renderer");

/** A burst of errors (one thrown every frame) reaches the renderer at most this often. */
const EMIT_MS = 500;

export interface AppErrorsDeps {
	readonly emit: (errors: readonly AppError[]) => void;
	readonly now?: () => number;
}

/**
 * The renderer's errors, kept in main where Jeremy can see them without
 * devtools: each distinct one logged once (scope `renderer`), the last 50
 * listed for the Trust Inbox, repeats counted.
 */
export class AppErrorsService {
	readonly #deps: AppErrorsDeps;
	#errors: readonly AppError[] = [];
	#timer: NodeJS.Timeout | undefined;

	constructor(deps: AppErrorsDeps) {
		this.#deps = deps;
	}

	list(): readonly AppError[] {
		return this.#errors;
	}

	report(report: AppErrorReport): void {
		const { log: next, fresh } = recordError(
			this.#errors,
			report,
			this.#deps.now?.() ?? Date.now(),
		);
		this.#errors = next;
		if (fresh) log.error(report.message, { where: report.where, stack: report.stack });
		this.#schedule();
	}

	dismiss(id: string): void {
		this.#errors = this.#errors.filter((error) => error.id !== id);
		this.#schedule();
	}

	stop(): void {
		clearTimeout(this.#timer);
		this.#timer = undefined;
	}

	#schedule(): void {
		this.#timer ??= setTimeout(() => {
			this.#timer = undefined;
			this.#deps.emit(this.#errors);
		}, EMIT_MS);
	}
}

/** Feed the page's console errors (third-party libraries' too) and renderer crashes into `errors`. */
export function watchPageErrors(contents: WebContents, errors: AppErrorsService): void {
	contents.on("console-message", ({ level, message }) => {
		if (consoleErrorWorthKeeping(level, message)) {
			errors.report({ message: message.slice(0, 2_000), where: "console" });
		}
	});
	contents.on("render-process-gone", (_event, { reason }) =>
		errors.report({ message: `the window's renderer stopped (${reason})`, where: "renderer-gone" }),
	);
}
