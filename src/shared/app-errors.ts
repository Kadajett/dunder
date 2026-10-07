import { z } from "zod";
import type { Unsubscribe } from "./screens";

/** Where an error was seen: a React region's boundary, a window hook, the console, or main's view of the page. */
export const appErrorReportSchema = z.object({
	message: z.string().min(1).max(2_000),
	stack: z.string().max(8_000).optional(),
	/** e.g. `boundary:whiteboard`, `window`, `promise`, `console`, `renderer-gone`. */
	where: z.string().min(1).max(80),
});
export type AppErrorReport = z.infer<typeof appErrorReportSchema>;

/** One distinct error (same place, same message), with how often it happened. */
export interface AppError {
	readonly id: string;
	readonly message: string;
	readonly stack: string | undefined;
	readonly where: string;
	readonly count: number;
	/** Epoch milliseconds. */
	readonly firstAt: number;
	readonly lastAt: number;
}

/** `window.office.errors`: renderer errors Jeremy can see without devtools. */
export interface AppErrorsApi {
	/** The latest distinct errors, newest first. */
	list(): Promise<readonly AppError[]>;
	onChanged(listener: (errors: readonly AppError[]) => void): Unsubscribe;
	/** Fire-and-forget: tell main about an error. */
	report(report: AppErrorReport): void;
	dismiss(id: string): Promise<void>;
	/** Open the window's devtools (the page has no other way: shortcuts are taken). */
	openDevtools(): Promise<void>;
}
