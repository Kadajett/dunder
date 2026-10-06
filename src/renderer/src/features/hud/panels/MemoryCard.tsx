import type { CompanyMemory } from "@shared/office-stats";
import { useState } from "react";

type ForgetState = "idle" | "confirm" | "forgetting";

/** One memory, with a Forget action that asks before running `bd forget`. */
export function MemoryCard(props: {
	readonly cwd: string;
	readonly memory: CompanyMemory;
	readonly onForgotten: () => void;
}) {
	const { memory } = props;
	const [forget, setForget] = useState<ForgetState>("idle");
	const [error, setError] = useState<string>();

	const confirm = (): void => {
		setForget("forgetting");
		setError(undefined);
		void window.office.stats.forget(props.cwd, memory.key).then((result) => {
			setForget("idle");
			if (result.ok) props.onForgotten();
			else setError(result.reason);
		});
	};

	return (
		<article className="hud-card hud-memory" data-forget={forget}>
			<div className="hud-card-head">
				<span className="hud-memory-key">{memory.key}</span>
				{forget === "idle" ? (
					<button type="button" className="hud-memory-forget" onClick={() => setForget("confirm")}>
						Forget
					</button>
				) : null}
			</div>
			<p className="hud-card-line">{memory.text}</p>
			{forget === "idle" ? null : (
				<div className="hud-card-actions">
					<button type="button" disabled={forget === "forgetting"} onClick={confirm}>
						{forget === "forgetting" ? "Forgetting…" : "Forget this memory"}
					</button>
					<button
						type="button"
						className="secondary"
						disabled={forget === "forgetting"}
						onClick={() => setForget("idle")}
					>
						Keep it
					</button>
				</div>
			)}
			{error ? <p className="hud-card-error">Not forgotten: {error}</p> : null}
		</article>
	);
}
