import type { Layout } from "@shared/layout/schema";
import type { LiveAgent } from "../model/live-agents";
import { ZoneCard } from "./Labels";

/** Zones bound to a herdr workspace show live head counts instead of a tagline. */
function zoneSubtitle(
	zone: Layout["zones"][number],
	agents: readonly LiveAgent[],
): string | undefined {
	if (!zone.workspaceLabel) return zone.subtitle;
	const members = agents.filter((agent) => agent.workspaceLabel === zone.workspaceLabel);
	const working = members.filter((agent) => agent.status === "working").length;
	return `${members.length} agent${members.length === 1 ? "" : "s"} · ${working} working`;
}

export function ZoneCards(props: {
	readonly layout: Layout;
	readonly agents: readonly LiveAgent[];
}) {
	const { layout, agents } = props;
	return (
		<>
			{layout.zones.map((zone) => {
				const at = zone.labelAt ?? zone.rug?.center;
				if (!at) return null;
				return (
					<ZoneCard
						key={zone.id}
						position={[at.x, zone.labelHeight, at.z]}
						title={zone.title}
						subtitle={zoneSubtitle(zone, agents)}
						tone={zone.workspaceLabel ? "dark" : "light"}
					/>
				);
			})}
			{layout.callouts.map((callout) => (
				<ZoneCard
					key={callout.id}
					position={[callout.position.x, callout.height, callout.position.z]}
					title={callout.title}
					subtitle={callout.subtitle}
					tone={callout.tone}
				/>
			))}
		</>
	);
}
