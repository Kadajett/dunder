import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChiefMarkdown } from "./ChiefMarkdown";

const render = (text: string): string =>
	renderToStaticMarkup(createElement(ChiefMarkdown, { text }));

describe("ChiefMarkdown", () => {
	it("renders a GFM table", () => {
		const html = render("| Agent | Bead |\n| --- | --- |\n| ben | office-m5t |");
		expect(html).toContain("<table>");
		expect(html).toContain("<th>Agent</th>");
		expect(html).toContain("<td>office-m5t</td>");
	});

	it("renders bullet and numbered lists, bold and inline code", () => {
		const html = render("- **done**: `npm run check`\n- next\n\n1. one\n2. two");
		expect(html).toMatch(/<ul>\s*<li><strong>done<\/strong>: <code>npm run check<\/code><\/li>/);
		expect(html).toMatch(/<ol>\s*<li>one<\/li>/);
	});

	it("renders fenced code blocks", () => {
		expect(render("```ts\nconst a = 1;\n```")).toContain(
			'<pre><code class="language-ts">const a = 1;\n</code></pre>',
		);
	});

	it("shows raw HTML as text instead of elements", () => {
		const html = render('Hi <script>alert("x")</script> and <b onclick="steal()">bold</b>');
		expect(html).not.toContain("<script");
		expect(html).not.toContain("<b ");
		expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
		expect(html).toContain("&lt;b onclick=&quot;steal()&quot;&gt;");
	});

	it("shows an HTML block as text too", () => {
		const html = render('<div onmouseover="x()">\nhello\n</div>');
		expect(html).not.toContain("<div onmouseover");
		expect(html).toContain("&lt;div onmouseover=");
	});

	it("opens links in a new window (routed to the system browser) and drops javascript: URLs", () => {
		expect(render("[docs](https://herdr.dev)")).toContain(
			'<a href="https://herdr.dev" target="_blank" rel="noreferrer noopener">docs</a>',
		);
		expect(render("[bad](javascript:alert(1))")).not.toContain("javascript:");
	});

	it("replaces images with their alt text", () => {
		const html = render("![chart](https://example.com/c.png)");
		expect(html).not.toContain("<img");
		expect(html).toContain("[chart]");
	});
});
