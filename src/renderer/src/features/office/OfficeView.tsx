import { Canvas } from "@react-three/fiber";
import type { Layout } from "@shared/layout/schema";
import { PCFSoftShadowMap } from "three";
import { useChief } from "../chief/chief-store";
import { EditLayer } from "../edit/EditLayer";
import { useEdit } from "../edit/edit-store";
import { useWorlds } from "./behaviour/useWorlds";
import { AgentActor } from "./characters/AgentActor";
import { SpeechBubble } from "./conversations/SpeechBubble";
import { useFocus } from "./focus/focus-store";
import { openScreen } from "./focus/open-screen";
import { Clickable } from "./interaction/Clickable";
import { useSelection } from "./interaction/selection-store";
import { ZoneCards } from "./labels/ZoneCards";
import type { OfficeModel } from "./model/office-model";
import { OfficeCamera } from "./OfficeCamera";
import { Backdrop } from "./scene/Backdrop";
import { DecorItems } from "./scene/DecorItems";
import { DeskStation } from "./scene/DeskStation";
import { Lights } from "./scene/Lights";
import { Room } from "./scene/Room";
import { Rug } from "./scene/Rug";

export interface OfficeViewProps {
	readonly layout: Layout;
	readonly model: OfficeModel;
}

/** The isometric office: a pure function of the layout and live herdr state (plus edit mode's pick layer). */
export function OfficeView({ layout, model }: OfficeViewProps) {
	const worlds = useWorlds(layout, model.seated);
	const focusedDesk = useFocus((state) => state.target?.deskId);
	const select = useSelection((state) => state.select);
	const clearSelection = useSelection((state) => state.clear);
	const openChief = useChief((state) => state.open);
	const editing = useEdit((state) => state.editing);
	const seatByDesk = new Map(model.seated.map((seat) => [seat.desk.id, seat]));

	return (
		<Canvas
			shadows={{ type: PCFSoftShadowMap }}
			dpr={[1, 2]}
			orthographic
			onPointerMissed={() => {
				clearSelection();
				useEdit.getState().select(null);
			}}
		>
			<Backdrop />
			<OfficeCamera room={layout.room} />
			<Lights />
			<Room room={layout.room} />
			{layout.zones.map((zone) => (zone.rug ? <Rug key={zone.id} rug={zone.rug} /> : null))}
			<DecorItems layout={layout} />
			{layout.desks.map((desk) => {
				const seat = seatByDesk.get(desk.id);
				// Your desk (reserved, nobody pinned) opens the Chief of Staff chat.
				const yours = desk.reserved && !desk.agentName;
				return (
					<DeskStation
						key={desk.id}
						desk={desk}
						status={seat?.agent.status ?? "empty"}
						paneId={seat?.agent.paneId}
						screenLive={focusedDesk !== desk.id}
						onOpenScreen={
							editing ? undefined : seat ? () => openScreen(seat) : yours ? openChief : undefined
						}
					/>
				);
			})}
			{model.seated.map(({ agent }, index) => {
				const world = worlds.get(agent.paneId);
				if (!world) return null;
				return (
					<Clickable
						key={agent.paneId}
						onSelect={() => select({ kind: "agent", paneId: agent.paneId })}
					>
						<AgentActor
							agent={agent}
							world={world}
							phase={index * 0.7}
							overlay={<SpeechBubble agentName={agent.name} height={2.35} />}
						/>
					</Clickable>
				);
			})}
			{editing ? <EditLayer layout={layout} /> : null}
			<ZoneCards layout={layout} agents={model.agents} />
		</Canvas>
	);
}
