import type { AppError, AppErrorReport } from "@shared/app-errors";
import { create } from "zustand";

/** Main's list of the renderer's errors, newest first. */
export const useAppErrors = create<{ readonly errors: readonly AppError[] }>(() => ({
	errors: [],
}));

const available = (): boolean => "errors" in window.office;

/** An error (or anything thrown) as a report main can keep: message, stack, where it happened. */
export function toReport(error: unknown, where: string): AppErrorReport {
	if (error instanceof Error) {
		return {
			message: (error.message || error.name).slice(0, 2_000),
			...(error.stack ? { stack: error.stack.slice(0, 8_000) } : {}),
			where,
		};
	}
	return { message: (String(error) || "unknown error").slice(0, 2_000), where };
}

/** Tell main about an error; a preload without the errors API (hot reload) keeps it in the console only. */
export function reportError(error: unknown, where: string): void {
	if (available()) window.office.errors.report(toReport(error, where));
}

/**
 * Errors nothing else catches: uncaught exceptions and rejected promises go
 * to main with their stack. (Console errors from libraries main hears itself.)
 */
export function installErrorHooks(): void {
	window.addEventListener("error", (event) => reportError(event.error ?? event.message, "window"));
	window.addEventListener("unhandledrejection", (event) => reportError(event.reason, "promise"));
}

/** Follow main's error list for the page's lifetime. */
export function connectAppErrors(): () => void {
	if (!available()) return () => undefined;
	const api = window.office.errors;
	let live = true;
	void api.list().then((errors) => {
		if (live) useAppErrors.setState({ errors });
	});
	const off = api.onChanged((errors) => useAppErrors.setState({ errors }));
	return () => {
		live = false;
		off();
	};
}

export function dismissAppError(id: string): void {
	useAppErrors.setState((state) => ({ errors: state.errors.filter((error) => error.id !== id) }));
	if (available()) void window.office.errors.dismiss(id);
}

export function openDevtools(): void {
	if (available()) void window.office.errors.openDevtools();
}
