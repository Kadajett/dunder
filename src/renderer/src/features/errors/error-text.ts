import type { AppError } from "@shared/app-errors";

/** Stack lines Max gets: enough to find the place, not the whole trace. */
const STACK_HEAD_LINES = 6;

/** Where an error came from, in words. */
export function whereLabel(where: string): string {
	if (where.startsWith("boundary:")) return `in the ${where.slice("boundary:".length)}`;
	const labels: Readonly<Record<string, string>> = {
		window: "uncaught",
		promise: "unhandled promise",
		console: "console error",
		react: "React",
		"renderer-gone": "renderer crashed",
	};
	return labels[where] ?? where;
}

const clock = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

/**
 * The chief message 'Tell Max' sends: what broke, where, how often since
 * when, and the head of the stack, so he can hand it to an engineer.
 */
export function errorForMax(error: AppError): string {
	const often =
		error.count > 1
			? `${error.count}× since ${clock.format(error.firstAt)}`
			: `at ${clock.format(error.lastAt)}`;
	const stack = error.stack?.split("\n").slice(0, STACK_HEAD_LINES).join("\n");
	return [
		`Dunder hit an app error (${whereLabel(error.where)}, ${often}): ${error.message}`,
		...(stack ? ["", "```", stack, "```"] : []),
		"",
		"Can you get someone to look into it?",
	].join("\n");
}

/** Where an error's hand-off to Max stands. */
export type ToldState =
	| { readonly state: "sending" }
	/** `count`: how often it had happened when Max heard; more since means it's worth telling again. */
	| { readonly state: "sent"; readonly count: number }
	| { readonly state: "failed"; readonly reason: string };

/** The card's view: sent to Max, unless it has happened again since. */
export function toldStateFor(error: AppError, told: ToldState | undefined): ToldState | undefined {
	return told?.state === "sent" && told.count < error.count ? undefined : told;
}
