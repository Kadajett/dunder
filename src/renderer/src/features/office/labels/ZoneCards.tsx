import type { Layout } from "@shared/layout/schema";
import type { LiveAgent } from "../model/live-agents";
import { ZoneCard } from "./Labels";
import { useHoveredZone, ZoneCaption } from "./ZoneCaption";

interface ZoneLine {
	readonly subtitle?: string | undefined;
	readonly highlight?: string | undefined;
}

/**
 * Zones bound to a herdr workspace show live head counts instead of a tagline,
 * with the working count highlighted while anyone is working.
 */
function zoneLine(zone: Layout["zones"][number], agents: readonly LiveAgent[]): ZoneLine {
	if (!zone.workspaceLabel) return { subtitle: zone.subtitle };
	const members = agents.filter((agent) => agent.workspaceLabel === zone.workspaceLabel);
	const working = members.filter((agent) => agent.status === "working").length;
	const headcount = `${members.length} agent${members.length === 1 ? "" : "s"}`;
	return working > 0
		? { subtitle: headcount, highlight: `${working} working` }
		: { subtitle: `${headcount} · 0 working` };
}

export function ZoneCards(props: {
	readonly layout: Layout;
	readonly agents: readonly LiveAgent[];
}) {
	const { layout, agents } = props;
	const hovered = useHoveredZone(layout.zones);
	return (
		<>
			{layout.zones.map((zone) => {
				if (zone.labelMode === "hover") {
					return <ZoneCaption key={zone.id} zone={zone} visible={hovered === zone.id} />;
				}
				const at = zone.labelAt ?? zone.rug?.center;
				if (!at) return null;
				return (
					<ZoneCard
						key={zone.id}
						position={[at.x, zone.labelHeight, at.z]}
						title={zone.title}
						{...zoneLine(zone, agents)}
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
