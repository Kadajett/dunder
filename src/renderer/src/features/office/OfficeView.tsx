import { Canvas } from "@react-three/fiber";
import type { Layout } from "@shared/layout/schema";
import { useMemo, useState } from "react";
import { useChief } from "../chief/chief-store";
import { EditLayer } from "../edit/EditLayer";
import { useEdit } from "../edit/edit-store";
import { poolTableOf } from "../pool/table-space";
import { useWorlds } from "./behaviour/useWorlds";
import { AgentActor, type AgentActorProps } from "./characters/AgentActor";
import { SpeechBubble } from "./conversations/SpeechBubble";
import { useFocus } from "./focus/focus-store";
import { openScreen } from "./focus/open-screen";
import { Clickable } from "./interaction/Clickable";
import { useSelection } from "./interaction/selection-store";
import { Callouts } from "./labels/Callouts";
import { DeskNotes } from "./mail/DeskNotes";
import type { OfficeModel } from "./model/office-model";
import { OfficeCamera } from "./OfficeCamera";
import { Backdrop } from "./scene/Backdrop";
import { DecorItems } from "./scene/DecorItems";
import { DeskStation } from "./scene/DeskStation";
import { Lights } from "./scene/Lights";
import { Room } from "./scene/Room";
import { Rug } from "./scene/Rug";
import { StaticBatch } from "./scene/StaticBatch";

export interface OfficeViewProps {
	readonly layout: Layout;
	readonly model: OfficeModel;
}

/** The isometric office: a pure function of the layout and live herdr state (plus edit mode's pick layer). */
export function OfficeView({ layout, model }: OfficeViewProps) {
	const worlds = useWorlds(layout, model.seated);
	const focusedDesk = useFocus((state) =>
		state.target?.kind === "screen" ? state.target.deskId : undefined,
	);
	const select = useSelection((state) => state.select);
	const clearSelection = useSelection((state) => state.clear);
	const openChief = useChief((state) => state.open);
	const editing = useEdit((state) => state.editing);
	const seatByDesk = new Map(model.seated.map((seat) => [seat.desk.id, seat]));
	const poolTable = useMemo(() => poolTableOf(layout), [layout]);

	return (
		<Canvas
			shadows
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
			{/* Editing moves things live; batching would re-merge on every drag step. */}
			<StaticBatch deps={[layout]} enabled={!editing}>
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
			</StaticBatch>
			{/* Outside the batch: notes come and go with the mail, so they are never baked. */}
			<DeskNotes seated={model.seated} />
			{model.seated.map(({ agent }, index) => {
				const world = worlds.get(agent.paneId);
				if (!world) return null;
				return (
					<Colleague
						key={agent.paneId}
						agent={agent}
						world={world}
						phase={index * 0.7}
						poolTable={poolTable}
						onSelect={() => select({ kind: "agent", paneId: agent.paneId })}
					/>
				);
			})}
			{editing ? <EditLayer layout={layout} /> : null}
			<Callouts callouts={layout.callouts} />
		</Canvas>
	);
}

/** One agent in the room: clickable, with what they're saying overhead (and, on hover, what they wait for). */
function Colleague({
	agent,
	world,
	phase,
	poolTable,
	onSelect,
}: Pick<AgentActorProps, "agent" | "world" | "phase" | "poolTable"> & {
	readonly onSelect: () => void;
}) {
	const [hovered, setHovered] = useState(false);
	return (
		<Clickable onSelect={onSelect} onHoverChange={setHovered}>
			<AgentActor
				agent={agent}
				world={world}
				phase={phase}
				poolTable={poolTable}
				overlay={
					<SpeechBubble
						agentName={agent.name}
						height={2.35}
						hovered={hovered}
						blocked={agent.status === "blocked"}
					/>
				}
			/>
		</Clickable>
	);
}
