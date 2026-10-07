import type { AppError } from "@shared/app-errors";
import { chiefAvailable } from "../../chief/chat-store";
import { toldStateFor, whereLabel } from "../../errors/error-text";
import { dismissAppError, openDevtools } from "../../errors/errors-store";
import { tellMaxAbout, useToldMax } from "../../errors/tell-max";
import { WorkMenuButton } from "../../work/WorkMenu";
import "../../work/work-card.css";
import "./error-card.css";

const tellLabel = {
	idle: "Tell Max",
	sending: "Sending…",
	sent: "Sent to Max",
	failed: "Tell Max",
} as const;

const time = new Intl.DateTimeFormat("en-US", {
	hour: "numeric",
	minute: "2-digit",
	second: "2-digit",
});

/**
 * One of the app's own errors: the message, where and how often, with the
 * stack a click away. The way out is handing it to Max; devtools waits in
 * the ⋯ menu for whoever debugs it.
 */
export function ErrorCard({ error }: { readonly error: AppError }) {
	const told = toldStateFor(
		error,
		useToldMax((state) => state.told[error.id]),
	);
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
				<WorkMenuButton
					className="hud-card-more"
					label="More for this error"
					menuLabel="Error"
					items={[{ key: "devtools", label: "Open devtools", onSelect: openDevtools }]}
				>
					⋯
				</WorkMenuButton>
			</div>
			<p className="hud-card-quote">{error.message}</p>
			{error.stack ? (
				<details>
					<summary>Stack</summary>
					<pre className="hud-card-stack">{error.stack}</pre>
				</details>
			) : null}
			<div className="hud-card-actions">
				<button
					type="button"
					disabled={!chiefAvailable || told?.state === "sending" || told?.state === "sent"}
					onClick={() => void tellMaxAbout(error)}
				>
					{tellLabel[told?.state ?? "idle"]}
				</button>
				<button type="button" className="secondary" onClick={() => dismissAppError(error.id)}>
					Dismiss
				</button>
			</div>
			{told?.state === "failed" ? <p className="hud-card-error">{told.reason}</p> : null}
		</article>
	);
}
