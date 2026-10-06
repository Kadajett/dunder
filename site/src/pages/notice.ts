export interface Notice {
	status: number;
	title: string;
	message: string;
	headers?: Record<string, string>;
}

const ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

export function escapeHtml(text: string): string {
	return text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

const STYLE = `
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;
background:#f3ecdf;color:#2b2621;font:16px/1.6 Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:520px;background:#fffdf8;border:1px solid #e4d9c6;border-radius:18px;padding:36px;
box-shadow:0 18px 40px -24px rgba(70,50,20,.35)}
.mark{display:inline-grid;place-items:center;width:44px;height:44px;border-radius:12px;background:#fffdf8;
border:1.5px solid #2b2621;font-weight:800;font-size:22px;margin-bottom:18px}
h1{margin:0 0 8px;font-size:24px;letter-spacing:-.01em}
p{margin:0 0 14px;color:#5b5147}
a{color:#2f7a4d;font-weight:600}
code{font:14px "JetBrains Mono",ui-monospace,monospace;background:#f3ecdf;padding:2px 6px;border-radius:6px}
`;

/** A small, on-brand HTML page for errors and "not yet" states. */
export function noticePage(notice: Notice): Response {
	const title = escapeHtml(notice.title);
	const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Dunder</title><link rel="icon" href="/favicon.svg"><style>${STYLE}</style></head>
<body><main><div class="mark">D</div><h1>${title}</h1><p>${escapeHtml(notice.message)}</p>
<p><a href="/">← Back to dunder.yougotserved.dev</a></p></main></body></html>`;
	return new Response(html, {
		status: notice.status,
		headers: {
			"content-type": "text/html; charset=utf-8",
			"cache-control": "no-store",
			...notice.headers,
		},
	});
}
