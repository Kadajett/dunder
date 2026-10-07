import { PLAN_FOCUS_MAX, type PlanItem, type PlanProposal } from "@shared/plan";
import { useMemo, useState } from "react";
import { BeadChip } from "../chief/BeadChip";
import { useChief } from "../chief/chief-store";
import { formatClock } from "../feed/feed-model";
import { useRosterStore } from "../hire/roster-store";
import { AgentDot } from "../work/AgentDot";
import { WorkMenuButton } from "../work/WorkMenu";
import { applyPlanEdit, type PlanEdit, planCardDue, planChanged } from "./plan-model";
import { approvePlan, discussPlan, editPlan, usePlan } from "./plan-store";
import "../chief/chief-markdown.css";
import "../whats-new/whats-new.css";
import "./plan.css";

/** Who can take an item: everyone hired and not fired (plus whoever has it now). */
function useHiredNames(current: string): readonly string[] {
	const roster = useRosterStore((state) => state.roster);
	return useMemo(() => {
		const hired = (roster?.agents ?? [])
			.filter((agent) => agent.firedAt === undefined)
			.map((agent) => agent.name);
		return hired.includes(current) ? hired : [current, ...hired];
	}, [roster, current]);
}

function WhoMenu({
	item,
	onPick,
}: {
	readonly item: PlanItem;
	readonly onPick: (who: string) => void;
}) {
	const names = useHiredNames(item.who);
	return (
		<WorkMenuButton
			className="work-chip work-chip--assignee"
			label={`${item.who}: give it to someone else`}
			menuLabel="Who"
			items={names.map((name) => ({
				key: name,
				label: (
					<>
						<AgentDot name={name} />
						{name}
					</>
				),
				checked: name === item.who,
				onSelect: () => onPick(name),
			}))}
		>
			<AgentDot name={item.who} />
			<span className="work-chip__text">{item.who}</span>
		</WorkMenuButton>
	);
}

interface ItemRowProps {
	readonly item: PlanItem;
	readonly index: number;
	readonly count: number;
	/** Only in edit mode. */
	readonly onEdit?: (edit: PlanEdit) => void;
}

function ItemRow({ item, index, count, onEdit }: ItemRowProps) {
	return (
		<li className="plan__item">
			<div className="plan__item-head">
				<BeadChip id={item.bead} code={false} />
				{onEdit ? (
					<WhoMenu item={item} onPick={(who) => onEdit({ kind: "assign", index, who })} />
				) : (
					<span className="plan__who">
						<AgentDot name={item.who} />
						{item.who}
					</span>
				)}
				{onEdit ? (
					<span className="plan__tools">
						<button
							type="button"
							aria-label="Move up"
							disabled={index === 0}
							onClick={() => onEdit({ kind: "move", index, by: -1 })}
						>
							↑
						</button>
						<button
							type="button"
							aria-label="Move down"
							disabled={index === count - 1}
							onClick={() => onEdit({ kind: "move", index, by: 1 })}
						>
							↓
						</button>
						<button
							type="button"
							aria-label={`Remove ${item.bead}`}
							onClick={() => onEdit({ kind: "remove", index })}
						>
							×
						</button>
					</span>
				) : null}
			</div>
			<p className="plan__why">{item.why}</p>
		</li>
	);
}

function Body({
	plan,
	onEdit,
}: {
	readonly plan: PlanProposal;
	readonly onEdit?: (edit: PlanEdit) => void;
}) {
	return (
		<>
			{onEdit ? (
				<input
					className="plan__focus-input"
					aria-label="Today's focus"
					maxLength={PLAN_FOCUS_MAX}
					value={plan.focus}
					onChange={(event) => onEdit({ kind: "focus", text: event.target.value })}
				/>
			) : (
				<p className="plan__focus">{plan.focus}</p>
			)}
			<ol className="plan__items">
				{plan.items.map((item, index) => (
					<ItemRow
						key={item.bead}
						item={item}
						index={index}
						count={plan.items.length}
						{...(onEdit && { onEdit })}
					/>
				))}
			</ol>
			{plan.notToday.length > 0 ? (
				<div className="plan__not-today">
					<p>Not today</p>
					<ul>
						{plan.notToday.map((line) => (
							<li key={line}>{line}</li>
						))}
					</ul>
				</div>
			) : null}
		</>
	);
}

function talkToMax(): void {
	void discussPlan();
	useChief.getState().open();
}

/**
 * Max's proposed plan for the day, top-centre (before What's new and the
 * Away card): approve it, edit it in place, or talk it through with Max.
 */
export function PlanCard() {
	const plan = usePlan((state) => state.plan);
	const busy = usePlan((state) => state.busy);
	const error = usePlan((state) => state.error);
	const [draft, setDraft] = useState<PlanProposal | null>(null);
	if (!plan || !planCardDue(plan)) return null;
	const editing = draft !== null;
	const shown = draft ?? plan.proposal;
	const save = (): void => {
		if (!draft) return;
		if (!planChanged(draft, plan.proposal)) {
			setDraft(null);
			return;
		}
		void editPlan(draft).then((ok) => ok && setDraft(null));
	};
	return (
		<section className="whats-new plan" aria-label="Today's plan">
			<header className="whats-new__header">
				<div>
					<h2 className="whats-new__heading">Today's plan</h2>
					<span className="whats-new__build">
						from Max at {formatClock(plan.proposedAt)} · he goes ahead at{" "}
						{formatClock(plan.proceedAt)} unless you edit
					</span>
				</div>
			</header>
			<Body
				plan={shown}
				{...(editing && { onEdit: (edit: PlanEdit) => setDraft(applyPlanEdit(shown, edit)) })}
			/>
			{error ? <p className="plan__error">{error}</p> : null}
			<footer className="plan__actions">
				{editing ? (
					<>
						<button
							type="button"
							className="whats-new__done"
							disabled={busy || !shown.focus.trim()}
							onClick={save}
						>
							Save
						</button>
						<button type="button" className="plan__secondary" onClick={() => setDraft(null)}>
							Cancel
						</button>
					</>
				) : (
					<>
						<button
							type="button"
							className="whats-new__done"
							disabled={busy}
							onClick={() => void approvePlan()}
						>
							Approve
						</button>
						<button
							type="button"
							className="plan__secondary"
							onClick={() => setDraft(plan.proposal)}
						>
							Edit
						</button>
						<button type="button" className="plan__secondary" onClick={talkToMax}>
							Talk to Max
						</button>
					</>
				)}
			</footer>
		</section>
	);
}
