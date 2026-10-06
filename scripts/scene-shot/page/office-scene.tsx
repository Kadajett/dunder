import { useOfficeSession } from "@renderer/features/herdr/useOfficeSession";
import { connectConversations } from "@renderer/features/office/conversations/conversation-store";
import { connectMailQueue } from "@renderer/features/office/mail/mail-queue-store";
import { useOfficeModel } from "@renderer/features/office/model/office-model";
import { OfficeView } from "@renderer/features/office/OfficeView";
import { DEFAULT_LAYOUT } from "@shared/layout/default-layout";
import { useEffect } from "react";

/** The real office scene (no HUD) for the default layout, with the crew and mail from `fake-office`. */
export function Scene() {
	const { snapshot } = useOfficeSession();
	const model = useOfficeModel(DEFAULT_LAYOUT, snapshot);
	useEffect(connectMailQueue, []);
	useEffect(connectConversations, []);
	return (
		<div className="office-app" data-view="office">
			<OfficeView layout={DEFAULT_LAYOUT} model={model} />
		</div>
	);
}
