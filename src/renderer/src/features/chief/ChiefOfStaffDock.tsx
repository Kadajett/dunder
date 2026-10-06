import { CHIEF_NAME, CHIEF_ROLE, type ChiefPresence } from "@shared/chief";
import { useEffect } from "react";
import type { OfficeModel } from "../office/model/office-model";
import { ChiefAvatar } from "./ChiefAvatar";
import { ChiefChat } from "./ChiefChat";
import { displayName, presenceLabel } from "./chat-model";
import { chiefAvailable, connectChief, useChiefChat } from "./chat-store";
import { useChief } from "./chief-store";
import "./chief.css";

function Dock({ model }: { readonly model: OfficeModel }) {
	useEffect(connectChief, []);
	const status = useChiefChat((state) => state.status);
	const expanded = useChief((state) => state.expanded);
	const toggle = useChief((state) => state.toggle);
	const close = useChief((state) => state.close);
	const name = status?.name ?? CHIEF_NAME;
	// herdr's live status beats the roster's, which only refreshes every few seconds.
	const live = model.agents.find((agent) => agent.name === name);
	const presence: ChiefPresence = live?.status ?? status?.status ?? "offline";
	const role = (status?.role ?? CHIEF_ROLE).replaceAll("-", " ").toUpperCase();
	const style = status?.style ?? null;
	return (
		<section className="chief" data-presence={presence} aria-label="Chief of Staff">
			{expanded && (
				<ChiefChat
					name={displayName(name)}
					role={role}
					presence={presence}
					style={style}
					onClose={close}
				/>
			)}
			<button type="button" className="chief__pill" onClick={toggle} aria-expanded={expanded}>
				<ChiefAvatar style={style} size={40} />
				<span className="chief__who">
					<span className="chief__name">{displayName(name)}</span>
					<span className="chief__meta">
						{role} · {presenceLabel(presence)}
					</span>
				</span>
				<span className="chief__dot" />
			</button>
		</section>
	);
}

/** Bottom-right Chief of Staff: a pill that expands into Jeremy's chat with the chief. */
export function ChiefOfStaffDock({ model }: { readonly model: OfficeModel }) {
	return chiefAvailable ? <Dock model={model} /> : null;
}
