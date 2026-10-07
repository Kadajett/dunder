/** An ask offers 2-4 answers, each short enough for a button. */
export const ASK_OPTIONS_MIN = 2;
export const ASK_OPTIONS_MAX = 4;
export const ASK_OPTION_MAX = 120;

const OPTIONS_LINE = /^\s*options:\s*$/i;
const BULLET = /^\s*[-*]\s+(.*\S)\s*$/;

export interface AskOptions {
	/** The ask's description without its Options block (all of it when there is none). */
	readonly body: string;
	/** The answers to pick from, recommended first; empty when the ask offers none. */
	readonly options: readonly string[];
}

/**
 * The answers an ask offers: its description ends with an 'Options:' line
 * and 2-4 '- ' bullets, recommended first (office-protocol.md). Anything
 * else (one option, five, a long one, text after the bullets) is no options,
 * and the description stays whole.
 */
export function parseAskOptions(detail: string): AskOptions {
	const whole = { body: detail.trim(), options: [] };
	const lines = detail.trimEnd().split("\n");
	let start = -1;
	for (let index = lines.length - 1; index >= 0; index -= 1) {
		if (OPTIONS_LINE.test(lines[index] ?? "")) {
			start = index;
			break;
		}
	}
	if (start === -1) return whole;
	const bullets = lines.slice(start + 1).map((line) => BULLET.exec(line)?.[1]);
	const options = bullets.filter((option): option is string => option !== undefined);
	if (options.length !== bullets.length) return whole;
	if (options.length < ASK_OPTIONS_MIN || options.length > ASK_OPTIONS_MAX) return whole;
	if (options.some((option) => option.length > ASK_OPTION_MAX)) return whole;
	return { body: lines.slice(0, start).join("\n").trim(), options };
}
