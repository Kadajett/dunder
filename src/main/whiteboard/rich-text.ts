/** Plain text of a tldraw rich text document (TipTap JSON): paragraphs on their own lines. */
export function plainText(node: unknown): string {
	if (typeof node !== "object" || node === null) return "";
	if ("text" in node && typeof node.text === "string") return node.text;
	const content = "content" in node && Array.isArray(node.content) ? node.content : [];
	const parts = content.map(plainText);
	return "type" in node && node.type === "doc" ? parts.join("\n") : parts.join("");
}
