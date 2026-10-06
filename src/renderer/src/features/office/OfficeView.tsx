import { Canvas } from "@react-three/fiber";
import type { SessionSnapshot } from "@shared/herdr/schema";
import type { Desk, Layout } from "@shared/layout/schema";
import { seatAgents } from "@shared/layout/seating";
import { useMemo } from "react";
import { PCFSoftShadowMap } from "three";
import type { BrainWorld } from "./behaviour/brain";
import { buildNavGrid } from "./behaviour/nav-grid";
import { findPath } from "./behaviour/pathfind";
import { chooseSpot, decorSpots } from "./behaviour/spots";
import { AgentActor } from "./characters/AgentActor";
import { DECOR } from "./decor";
import { ZoneCard } from "./labels/Labels";
import { type LiveAgent, liveAgents } from "./model/live-agents";
import { OfficeCamera } from "./OfficeCamera";
import { DeskStation } from "./scene/DeskStation";
import { Room } from "./scene/Room";
import { Rug } from "./scene/Rug";
import { DEG, seatPlacement } from "./scene/station";

function Lights() {
	return (
		<>
			<hemisphereLight args={["#fff6e6", "#b8956a", 1.25]} />
			<ambientLight intensity={0.22} color="#ffe9cc" />
			<directionalLight
				position={[16, 26, 12]}
				intensity={1.9}
				color="#fff1dc"
				castShadow
				shadow-mapSize={[2048, 2048]}
				shadow-camera-left={-24}
				shadow-camera-right={24}
				shadow-camera-top={24}
				shadow-camera-bottom={-24}
				shadow-camera-near={1}
				shadow-camera-far={80}
				shadow-bias={-0.0005}
				shadow-normalBias={0.02}
			/>
		</>
	);
}

function Decor({ layout }: { readonly layout: Layout }) {
	return (
		<>
			{layout.decor.map((item) => {
				const Item = DECOR[item.kind];
				return (
					<group
						key={item.id}
						position={[item.position.x, item.elevation, item.position.z]}
						rotation={[0, item.rotation * DEG, 0]}
					>
						<Item {...(item.label ? { label: item.label } : {})} />
					</group>
				);
			})}
		</>
	);
}

function zoneSubtitle(
	zone: Layout["zones"][number],
	agents: readonly LiveAgent[],
): string | undefined {
	if (!zone.workspaceLabel) return zone.subtitle;
	const members = agents.filter((agent) => agent.workspaceLabel === zone.workspaceLabel);
	const working = members.filter((agent) => agent.status === "working").length;
	return `${members.length} agent${members.length === 1 ? "" : "s"} · ${working} working`;
}

function ZoneCards({
	layout,
	agents,
}: {
	readonly layout: Layout;
	readonly agents: readonly LiveAgent[];
}) {
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

interface Seat {
	readonly desk: Desk;
	readonly agent: LiveAgent;
}

/** Behaviour context per seated agent: its seat, where it may wander, and how to get there. */
function useWorlds(layout: Layout, seated: readonly Seat[]): Map<string, BrainWorld> {
	const grid = useMemo(() => buildNavGrid(layout), [layout]);
	const spots = useMemo(() => decorSpots(layout), [layout]);
	return useMemo(() => {
		const worlds = new Map<string, BrainWorld>();
		for (const { desk, agent } of seated) {
			const colleagues = seated
				.filter((other) => other.desk.id !== desk.id)
				.map((other) => other.desk);
			worlds.set(agent.paneId, {
				seat: seatPlacement(desk),
				pickSpot: (random) => chooseSpot(random, spots, colleagues),
				route: (from, to) => findPath(grid, from, to),
				random: Math.random,
			});
		}
		return worlds;
	}, [grid, spots, seated]);
}

export interface OfficeViewProps {
	readonly layout: Layout;
	readonly snapshot: SessionSnapshot | null;
}

/** The isometric office: a pure function of the layout and live herdr state. */
export function OfficeView({ layout, snapshot }: OfficeViewProps) {
	const agents = useMemo(() => liveAgents(snapshot), [snapshot]);
	const seated = useMemo(() => {
		const { seats } = seatAgents(layout, agents);
		const byPane = new Map(agents.map((agent) => [agent.paneId, agent]));
		return layout.desks.flatMap((desk) => {
			const agent = byPane.get(seats.get(desk.id)?.paneId ?? "");
			return agent ? [{ desk, agent }] : [];
		});
	}, [layout, agents]);
	const worlds = useWorlds(layout, seated);
	const statusByDesk = new Map(seated.map(({ desk, agent }) => [desk.id, agent.status]));

	return (
		<Canvas shadows={{ type: PCFSoftShadowMap }} dpr={[1, 2]} orthographic>
			<color attach="background" args={["#efe6d6"]} />
			<OfficeCamera room={layout.room} />
			<Lights />
			<Room room={layout.room} />
			{layout.zones.map((zone) => (zone.rug ? <Rug key={zone.id} rug={zone.rug} /> : null))}
			<Decor layout={layout} />
			{layout.desks.map((desk) => (
				<DeskStation key={desk.id} desk={desk} status={statusByDesk.get(desk.id) ?? "empty"} />
			))}
			{seated.map(({ agent }, index) => {
				const world = worlds.get(agent.paneId);
				return world ? (
					<AgentActor key={agent.paneId} agent={agent} world={world} phase={index * 0.7} />
				) : null;
			})}
			<ZoneCards layout={layout} agents={agents} />
		</Canvas>
	);
}
