import type { ComponentProps } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import "./chief-markdown.css";

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

const COMPONENTS: Components = { a: ExternalLink, img: ImageAsText };

const REMARK_PLUGINS = [remarkGfm, remarkHtmlAsText];

/** A Chief of Staff reply rendered as GitHub-flavoured Markdown, without raw HTML. */
export function ChiefMarkdown({ text }: { readonly text: string }) {
	return (
		<div className="chief-md">
			<Markdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
				{text}
			</Markdown>
		</div>
	);
}
