import { useAgentStyle } from "../hire/roster-store";

/** An agent's colour dot (their outfit colour), as on the work board's assignee chips. */
export function AgentDot({ name }: { readonly name: string }) {
	const color = useAgentStyle(name).outfit.color;
	return <span className="work-dot" style={{ background: color }} />;
}
