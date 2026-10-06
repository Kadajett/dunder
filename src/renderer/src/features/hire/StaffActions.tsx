import "./staff-actions.css";
import type { WorkforceResult } from "@shared/company/workforce";
import { useState } from "react";
import { useRosterStore } from "./roster-store";

type Pending = "restart" | "fire" | undefined;

/** Restart and Fire for one agent; firing asks first, since it is for good. */
export function StaffActions({ name, onFired }: { readonly name: string; onFired(): void }) {
	const hired = useRosterStore((state) =>
		state.roster?.agents.some((agent) => agent.name === name && agent.firedAt === undefined),
	);
	const [confirming, setConfirming] = useState(false);
	const [pending, setPending] = useState<Pending>();
	const [message, setMessage] = useState<string>();
	if (!("workforce" in window.office)) return null;
	const { workforce } = window.office;
	const run = async (action: Exclude<Pending, undefined>): Promise<void> => {
		setPending(action);
		setMessage(undefined);
		const result = await workforce[action](name).catch(
			(error: unknown): WorkforceResult => ({
				ok: false,
				error: error instanceof Error ? error.message : String(error),
			}),
		);
		setPending(undefined);
		setConfirming(false);
		if (!result.ok) setMessage(result.error);
		else if (action === "fire") onFired();
		else setMessage(`${name} is restarting and will pick up where they left off.`);
	};
	if (confirming) {
		return (
			<div className="staff-actions">
				<p className="staff-confirm">
					Fire {name}? Their pane closes and they are never respawned.
				</p>
				<div className="staff-row">
					<button
						type="button"
						className="card-action card-action-secondary"
						onClick={() => setConfirming(false)}
					>
						Keep {name}
					</button>
					<button
						type="button"
						className="card-action staff-fire"
						disabled={pending !== undefined}
						onClick={() => void run("fire")}
					>
						{pending === "fire" ? "Firing…" : `Fire ${name}`}
					</button>
				</div>
			</div>
		);
	}
	return (
		<div className="staff-actions">
			<div className="staff-row">
				<button
					type="button"
					className="card-action card-action-secondary"
					disabled={!hired || pending !== undefined}
					title={hired ? "Exit and respawn, resuming the session" : "Not on the roster"}
					onClick={() => void run("restart")}
				>
					{pending === "restart" ? "Restarting…" : "Restart"}
				</button>
				<button
					type="button"
					className="card-action card-action-secondary staff-fire-outline"
					onClick={() => setConfirming(true)}
				>
					Fire…
				</button>
			</div>
			{message ? <p className="staff-message">{message}</p> : null}
		</div>
	);
}
