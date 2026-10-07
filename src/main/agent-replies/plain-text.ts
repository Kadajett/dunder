/** Inline markdown that only styles text: the text stays, the markers go. */
const INLINE: readonly (readonly [RegExp, string])[] = [
	[/!\[([^\]]*)\]\([^)]*\)/g, "$1"],
	[/\[([^\]]+)\]\([^)]*\)/g, "$1"],
	[/`([^`\n]+)`/g, "$1"],
	[/\*\*([^*\n]+)\*\*/g, "$1"],
	[/__([^_\n]+)__/g, "$1"],
	[/(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])/g, "$1"],
	[/~~([^~\n]+)~~/g, "$1"],
];

/** Line markers: headings and quotes go, list bullets become '•', rules vanish. */
function plainLine(line: string): string {
	if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) return "";
	const stripped = line
		.replace(/^\s{0,3}#{1,6}\s+/, "")
		.replace(/^\s*>\s?/, "")
		.replace(/^(\s*)[-*+]\s+(\[[ xX]\]\s+)?/, "$1• ");
	return INLINE.reduce(
		(text, [pattern, replacement]) => text.replace(pattern, replacement),
		stripped,
	);
}

/**
 * An agent's markdown reply as plain text for a small card: fenced code
 * collapses to '[code]', styling markers are dropped, bullets read '•', and
 * runs of blank lines shrink to one.
 */
export function plainText(markdown: string): string {
	const withoutCode = markdown.replace(
		/^[ \t]*(```|~~~)[^\n]*\n[\s\S]*?(^[ \t]*\1[ \t]*$|(?![\s\S]))/gm,
		"[code]",
	);
	return withoutCode
		.split("\n")
		.map(plainLine)
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}
