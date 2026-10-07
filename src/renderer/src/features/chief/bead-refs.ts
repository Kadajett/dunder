/** A run of a reply's text: plain, or a bead id to render as a chip. */
export type BeadSegment = string | { readonly id: string };

/** Bead id prefixes ('office' in office-dkh), from the ids on the work board: no hard-coded company. */
export function beadPrefixes(ids: readonly string[]): string[] {
	const prefixes = ids.flatMap((id) => {
		const at = id.indexOf("-");
		return at > 0 ? [id.slice(0, at)] : [];
	});
	return [...new Set(prefixes)];
}

const literal = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * `<prefix>-<3+ lowercase letters/digits>` with optional `.N` sub-ids, not
 * glued to a longer word: 'office-dk7.2,' gives office-dk7.2, 'e-mail' and
 * 'pre-office-abc' nothing.
 */
function idPattern(prefixes: readonly string[]): RegExp | null {
	if (prefixes.length === 0) return null;
	const alternatives = prefixes.map(literal).join("|");
	return new RegExp(
		`(?<![\\w.-])(?:${alternatives})-[a-z0-9]{3,}(?:\\.[0-9]+)*(?![\\w-]|\\.[0-9])`,
		"g",
	);
}

/** `text` split into plain runs and the bead ids among them, in order. */
export function beadSegments(text: string, prefixes: readonly string[]): BeadSegment[] {
	const pattern = idPattern(prefixes);
	if (!pattern) return [text];
	const segments: BeadSegment[] = [];
	let from = 0;
	for (const match of text.matchAll(pattern)) {
		if (match.index > from) segments.push(text.slice(from, match.index));
		segments.push({ id: match[0] });
		from = match.index + match[0].length;
	}
	if (from < text.length) segments.push(text.slice(from));
	return segments;
}

interface MdastNode {
	readonly type: string;
	readonly value?: string;
	readonly children?: readonly MdastNode[];
	readonly data?: unknown;
}

/** Subtrees whose text is never a bead reference: links keep their text, code blocks stay verbatim. */
const SKIPPED = new Set(["link", "linkReference", "definition", "code", "html"]);

/** A chip node: react-markdown renders it as `<span data-bead>`, which ChiefMarkdown turns into a button. */
function chipNode(id: string, code: boolean): MdastNode {
	return {
		type: "beadRef",
		data: { hName: "span", hProperties: { dataBead: id, ...(code ? { dataCode: "true" } : {}) } },
		children: [{ type: "text", value: id }],
	};
}

/** One text or inline-code node as nodes: the same kind for plain runs, chips for ids. */
function splitNode(node: MdastNode, prefixes: readonly string[]): MdastNode[] {
	const segments = beadSegments(node.value ?? "", prefixes);
	if (segments.length === 1 && typeof segments[0] === "string") return [node];
	const code = node.type === "inlineCode";
	return segments.map((segment) =>
		typeof segment === "string" ? { ...node, value: segment } : chipNode(segment.id, code),
	);
}

function withRefs(node: MdastNode, prefixes: readonly string[]): MdastNode {
	if (!node.children || SKIPPED.has(node.type)) return node;
	const children = node.children.flatMap((child) =>
		child.type === "text" || child.type === "inlineCode"
			? splitNode(child, prefixes)
			: [withRefs(child, prefixes)],
	);
	return { ...node, children };
}

/** Remark plugin: bead ids in a reply's text and inline code become chip nodes. */
export function remarkBeadRefs(prefixes: readonly string[]) {
	return () => (tree: MdastNode) => withRefs(tree, prefixes);
}
