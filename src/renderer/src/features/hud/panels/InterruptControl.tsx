import { INTERRUPT_REASON_MAX } from "@shared/agent-replies";
import type { AgentStatus } from "@shared/herdr/schema";
import { useEffect, useState } from "react";
import {
	askInterrupt,
	cancelInterrupt,
	interrupt,
	noteStatus,
	useInterrupts,
} from "./interrupt-store";
import "./interrupt.css";

/** Confirm with an optional reason: Enter interrupts, Esc cancels. */
function Confirm({ name }: { readonly name: string }) {
	const [reason, setReason] = useState("");
	return (
		<form
			className="hud-interrupt"
			onSubmit={(event) => {
				event.preventDefault();
				void interrupt(name, reason);
			}}
		>
			<p className="hud-card-line">
				Interrupt {name}? It stops its current turn and reports where it got to. Max is told.
			</p>
			<input
				// biome-ignore lint/a11y/noAutofocus: opened by the Interrupt click, so the reason goes straight in.
				autoFocus
				maxLength={INTERRUPT_REASON_MAX}
				placeholder="Why? (optional)"
				aria-label={`Why interrupt ${name}`}
				value={reason}
				onChange={(event) => setReason(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Escape") cancelInterrupt(name);
				}}
			/>
			<div className="hud-card-actions">
				<button type="submit">Interrupt</button>
				<button type="button" className="secondary" onClick={() => cancelInterrupt(name)}>
					Cancel
				</button>
			</div>
		</form>
	);
}

/**
 * "Interrupt" for an agent card: stop its turn without firing it. Marked
 * "interrupted" until it has written its report.
 */
export function InterruptControl({
	name,
	status,
}: {
	readonly name: string;
	readonly status: AgentStatus;
}) {
	const state = useInterrupts((store) => store.byName[name]);
	useEffect(() => noteStatus(name, status), [name, status]);
	if (state?.phase === "confirm") return <Confirm name={name} />;
	if (state?.phase === "interrupted")
		return <p className="hud-interrupt__mark">interrupted · reporting back</p>;
	const busy = status === "working" || status === "blocked";
	return (
		<>
			<div className="hud-card-actions">
				<button
					type="button"
					className="secondary"
					disabled={!busy || state?.phase === "sending"}
					title={
						busy
							? "Stop its current turn without firing it"
							: `${name} isn't doing anything to interrupt`
					}
					onClick={() => askInterrupt(name)}
				>
					{state?.phase === "sending" ? "Interrupting…" : "Interrupt"}
				</button>
			</div>
			{state?.phase === "failed" ? <p className="hud-card-error">{state.reason}</p> : null}
		</>
	);
}
