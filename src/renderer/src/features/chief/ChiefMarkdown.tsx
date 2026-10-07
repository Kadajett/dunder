import { type ComponentProps, useMemo } from "react";
import Markdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import "./chief-markdown.css";
import { useWork } from "../work/work-store";
import { BeadChip } from "./BeadChip";
import { beadPrefixes, remarkBeadRefs } from "./bead-refs";

interface MdastNode {
	readonly type: string;
	readonly children?: readonly MdastNode[];
}

/** Copy of the tree with every raw `html` node turned into a `text` node of the same source. */
function htmlAsText(node: MdastNode): MdastNode {
	return {
		...node,
		type: node.type === "html" ? "text" : node.type,
		...(node.children && { children: node.children.map(htmlAsText) }),
	};
}

/** Raw HTML in a reply is shown as literal text, never parsed into elements. */
function remarkHtmlAsText() {
	return htmlAsText;
}

/** Links leave the app: `_blank` is routed to the system browser by the main process. */
function ExternalLink({ href, children }: ComponentProps<"a">) {
	return (
		<a href={href} target="_blank" rel="noreferrer noopener">
			{children}
		</a>
	);
}

/** Remote images are blocked by the CSP anyway; show their alt text instead of a broken image. */
function ImageAsText({ alt }: ComponentProps<"img">) {
	return alt ? <span className="chief-md__img">[{alt}]</span> : null;
}

/** Spans come only from bead-id chip nodes (Markdown itself makes none). */
function SpanOrChip({ node, children }: ComponentProps<"span"> & ExtraProps) {
	const id = node?.properties["dataBead"];
	if (typeof id !== "string") return <span>{children}</span>;
	return <BeadChip id={id} code={node?.properties["dataCode"] === "true"} />;
}

const COMPONENTS: Components = { a: ExternalLink, img: ImageAsText, span: SpanOrChip };

/** The bead id prefixes on the work board, as one stable key ('' while it hasn't loaded). */
function usePrefixKey(): string {
	return useWork((state) => {
		const board = state.board;
		if (board?.state !== "ok") return "";
		const ids = [...board.cards.map((card) => card.id), ...board.asks.map((ask) => ask.id)];
		return beadPrefixes(ids).sort().join(" ");
	});
}

/** GitHub-flavoured Markdown without raw HTML, bead ids with these prefixes as chips. */
export function ReplyMarkdown({
	text,
	prefixes,
}: {
	readonly text: string;
	readonly prefixes: readonly string[];
}) {
	const plugins = useMemo(
		() => [remarkGfm, remarkHtmlAsText, remarkBeadRefs(prefixes)],
		[prefixes],
	);
	return (
		<div className="chief-md">
			<Markdown remarkPlugins={plugins} components={COMPONENTS}>
				{text}
			</Markdown>
		</div>
	);
}

/**
 * A Chief of Staff reply rendered as GitHub-flavoured Markdown, without raw
 * HTML; bead ids (with the work board's prefixes) become chips.
 */
export function ChiefMarkdown({ text }: { readonly text: string }) {
	const prefixKey = usePrefixKey();
	const prefixes = useMemo(() => (prefixKey ? prefixKey.split(" ") : []), [prefixKey]);
	return <ReplyMarkdown text={text} prefixes={prefixes} />;
}
