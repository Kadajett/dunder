import type { PaneInfo } from "@shared/herdr/schema";
import { useState } from "react";
import { useOfficeSession } from "../features/herdr/useOfficeSession";
import { TerminalView } from "../features/terminal/TerminalView";

function paneTitle(pane: PaneInfo, agentName: string | undefined): string {
	return agentName ?? pane.label ?? pane.terminal_title_stripped ?? pane.pane_id;
}

export function App() {
	const { snapshot, status } = useOfficeSession();
	const [selected, setSelected] = useState<string>();
	const panes = snapshot?.panes ?? [];
	const agentByPane = new Map(snapshot?.agents.map((agent) => [agent.pane_id, agent]) ?? []);
	const firstAgentPane = snapshot?.agents[0]?.pane_id;
	const paneId = selected ?? firstAgentPane ?? panes[0]?.pane_id;
	const active = panes.find((pane) => pane.pane_id === paneId);

	return (
		<div className="m1-shell">
			<aside className="m1-sidebar">
				<header>
					<strong>office</strong>
					<span className={`bridge-status bridge-${status.state}`}>{status.state}</span>
				</header>
				<ul>
					{panes.map((pane) => {
						const agent = agentByPane.get(pane.pane_id);
						return (
							<li key={pane.pane_id}>
								<button
									type="button"
									className={pane.pane_id === paneId ? "selected" : ""}
									onClick={() => setSelected(pane.pane_id)}
								>
									<span className={`status-dot status-${pane.agent_status}`} />
									{paneTitle(pane, agent?.name)}
									<small>{agent ? `${agent.agent} · ${pane.agent_status}` : pane.pane_id}</small>
								</button>
							</li>
						);
					})}
				</ul>
			</aside>
			<main className="m1-screen">
				{active ? (
					<TerminalView
						key={active.pane_id}
						paneId={active.pane_id}
						bracketedPaste={agentByPane.has(active.pane_id)}
					/>
				) : (
					<p className="m1-empty">No panes in the office session yet.</p>
				)}
			</main>
		</div>
	);
}
