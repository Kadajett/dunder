import type { AppError } from "@shared/app-errors";
import { dismissAppError, openDevtools } from "../../errors/errors-store";

const time = new Intl.DateTimeFormat("en-US", {
	hour: "numeric",
	minute: "2-digit",
	second: "2-digit",
});

/** Where an error came from, in words. */
function whereLabel(where: string): string {
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

/** One of the app's own errors: the message, where and how often, with the stack a click away. */
export function ErrorCard({ error }: { readonly error: AppError }) {
	const times =
		error.count > 1
			? ` · ${error.count}×, last ${time.format(error.lastAt)}`
			: ` · ${time.format(error.lastAt)}`;
	return (
		<article className="hud-card" data-kind="error">
			<div className="hud-card-head">
				<i className="status-dot status-blocked" />
				<strong>App error</strong>
				<span className="hud-card-meta">
					{whereLabel(error.where)}
					{times}
				</span>
			</div>
			<p className="hud-card-quote">{error.message}</p>
			{error.stack ? (
				<details>
					<summary>Stack</summary>
					<pre className="hud-card-stack">{error.stack}</pre>
				</details>
			) : null}
			<div className="hud-card-actions">
				<button type="button" onClick={openDevtools}>
					Open devtools
				</button>
				<button type="button" className="secondary" onClick={() => dismissAppError(error.id)}>
					Dismiss
				</button>
			</div>
		</article>
	);
}
