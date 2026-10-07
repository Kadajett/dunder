import "./notices.css";
import type { WhatsNew } from "@shared/whats-new";
import { type ReactNode, useEffect, useState } from "react";
import { AwayCard, connectAway, useAway } from "../away/AwayCard";
import { UpdateCountdownBanner, useUpdateStatus } from "../hud/HudUpdate";
import { DayEndCard } from "../plan/DayEndCard";
import { PlanCard } from "../plan/PlanCard";
import { planCardDue } from "../plan/plan-model";
import { usePlan } from "../plan/plan-store";
import { connectWrap, useWrap, wrapDue } from "../plan/wrap-store";
import { AutopilotNotice } from "../pool/AutopilotNotice";
import { WhatsNewCard } from "../whats-new/WhatsNewCard";
import { loadWhatsNew, useWhatsNew } from "../whats-new/whats-new-store";
import { NOTICE_LABELS, type NoticeId, nextNotice, noticeQueue, shownNotice } from "./notice-queue";

function Notice({
	id,
	whatsNew,
}: {
	readonly id: NoticeId;
	readonly whatsNew: WhatsNew | null;
}): ReactNode {
	switch (id) {
		case "plan":
			return <PlanCard />;
		case "day-end":
			return <DayEndCard />;
		case "away":
			return <AwayCard />;
		case "since-you-left":
			return <AwayCard whatsNew={whatsNew} />;
		case "whats-new":
			return <WhatsNewCard />;
	}
}

/**
 * The one notice slot under the top bar: the morning plan, Max's evening
 * wrap-up, what happened while away, what's new. One shows at a time, the
 * rest wait behind a '+N' pager; the room stays clear around it.
 */
export function NoticeSlot() {
	useEffect(loadWhatsNew, []);
	useEffect(connectAway, []);
	useEffect(connectWrap, []);
	const planSettled = usePlan((state) => state.settled);
	const planDue = usePlan((state) => planCardDue(state.plan));
	const dayEnd = useWrap((state) => wrapDue(state.wrap));
	const whatsNew = useWhatsNew((state) => state.card);
	const awayDue = useAway((state) => state.summary !== null);
	const [picked, setPicked] = useState<NoticeId | null>(null);
	// Wait for main's answer on the plan: it comes first, so nothing shows before it.
	if (!planSettled) return null;
	const queue = noticeQueue({ plan: planDue, dayEnd, away: awayDue, whatsNew: whatsNew !== null });
	const shown = shownNotice(queue, picked);
	if (!shown) return null;
	const waiting = queue.filter((id) => id !== shown);
	return (
		<div className="notice-slot">
			<Notice id={shown} whatsNew={whatsNew} />
			{waiting.length > 0 ? (
				<button
					type="button"
					className="notice-pager"
					title={`Show ${NOTICE_LABELS[nextNotice(queue, shown)]}`}
					onClick={() => setPicked(nextNotice(queue, shown))}
				>
					+{waiting.length} · {waiting.map((id) => NOTICE_LABELS[id]).join(", ")}
				</button>
			) : null}
		</div>
	);
}

/**
 * Everything top-centre, in one column so nothing overlaps: the update
 * countdown or held chip, the pool autopilot countdown (office view), then
 * the notice slot.
 */
export function TopCentre({ officeView }: { readonly officeView: boolean }) {
	const update = useUpdateStatus();
	return (
		<div className="top-centre">
			<UpdateCountdownBanner status={update} />
			{officeView ? <AutopilotNotice /> : null}
			<NoticeSlot />
		</div>
	);
}
