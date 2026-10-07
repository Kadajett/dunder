import { SPOKEN_MAX } from "@shared/chief";

/** `Spoken: …`, also when Max dresses it up as `**Spoken:**` or quotes it. */
const SPOKEN_LINE = /^[ \t>*_]*spoken[*_]*[ \t]*:[*_]*[ \t]*(.*)$/i;

export interface SplitReply {
	/** The reply for the chat, without the spoken line. */
	readonly text: string;
	/** Plain text to read aloud, capped at SPOKEN_MAX; null when the reply has none. */
	readonly spoken: string | null;
}

/** Markdown leftovers that would be read out as symbols. */
function plain(text: string): string {
	return text
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/[`*_~#]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

/** At most `max` characters, cut after the last whole sentence (or a word, if one sentence runs on). */
export function capSpoken(text: string, max = SPOKEN_MAX): string {
	if (text.length <= max) return text;
	const head = text.slice(0, max);
	const ends = [...head.matchAll(/[.!?](?=["')\]]*(?:\s|$))/g)];
	const lastEnd = ends.at(-1)?.index;
	if (lastEnd !== undefined && lastEnd >= max / 3) return head.slice(0, lastEnd + 1);
	const space = head.lastIndexOf(" ", max - 1);
	return `${head.slice(0, space > 0 ? space : max - 1).trimEnd()}…`;
}

/**
 * Take the chief's last `Spoken:` paragraph (the line and any lines right
 * after it) out of a call reply. The chat keeps the rest; markdown is never
 * read aloud, so the spoken text is flattened to plain words.
 */
export function splitSpoken(reply: string): SplitReply {
	const lines = reply.split("\n");
	const start = lines.findLastIndex((line) => SPOKEN_LINE.test(line));
	if (start === -1) return { text: reply, spoken: null };
	const blank = lines.findIndex((line, index) => index > start && line.trim() === "");
	const end = blank === -1 ? lines.length : blank;
	const first = SPOKEN_LINE.exec(lines[start] ?? "")?.[1] ?? "";
	const spoken = capSpoken(plain([first, ...lines.slice(start + 1, end)].join(" ")));
	const text = [...lines.slice(0, start), ...lines.slice(end)].join("\n").trim();
	return { text, spoken: spoken.length > 0 ? spoken : null };
}
