import "./TeamCardActions.css";
import { useEffect, useId, useRef, useState } from "react";
import type { LiveAgent } from "../../office/model/live-agents";
import { ModelPicker } from "../../office/models/ModelPicker";
import { useWork } from "../../work/work-store";
import { OpenInEditor } from "../../worktrees/OpenInEditor";
import { InterruptControl } from "./InterruptControl";

const FOCUSABLE = "button:not(:disabled), input:not(:disabled), select:not(:disabled), summary";

export function TeamCardActions({
	agent,
	beads,
}: {
	readonly agent: LiveAgent;
	readonly beads: readonly string[];
}) {
	const [open, setOpen] = useState(false);
	const root = useRef<HTMLDivElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const menuId = useId();

	useEffect(() => {
		if (!open) return;
		root.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
		const onPointerDown = (event: PointerEvent): void => {
			if (!(event.target instanceof Node && root.current?.contains(event.target))) setOpen(false);
		};
		document.addEventListener("pointerdown", onPointerDown, true);
		return () => document.removeEventListener("pointerdown", onPointerDown, true);
	}, [open]);

	const onKeyDown = (event: React.KeyboardEvent<HTMLFieldSetElement>): void => {
		if (event.key !== "Escape") return;
		event.preventDefault();
		event.stopPropagation();
		setOpen(false);
		trigger.current?.focus();
	};
	return (
		<div ref={root} className="team-card-more">
			<button
				ref={trigger}
				type="button"
				className="team-card-more__trigger"
				aria-label={`More actions for ${agent.name}`}
				aria-expanded={open}
				aria-controls={menuId}
				title={`More actions for ${agent.name}`}
				onClick={() => setOpen((value) => !value)}
			>
				⋯
			</button>
			<fieldset
				id={menuId}
				className="team-card-more__panel"
				hidden={!open}
				onKeyDown={onKeyDown}
				onBlur={(event) => {
					const next = event.relatedTarget;
					if (!(next instanceof Node && event.currentTarget.contains(next))) setOpen(false);
				}}
			>
				<legend>Actions for {agent.name}</legend>
				<button
					type="button"
					className="secondary team-card-more__beads"
					title={`Open the work board on ${agent.name}'s beads only`}
					onClick={() => {
						setOpen(false);
						useWork.getState().showAgent(agent.name);
					}}
				>
					Beads
				</button>
				<OpenInEditor agent={agent.name} beads={beads} />
				{agent.kind === "omp" && "models" in window.office ? (
					<details className="team-card-more__model">
						<summary>Switch model</summary>
						<ModelPicker agentName={agent.name} />
					</details>
				) : null}
				<InterruptControl name={agent.name} status={agent.status} />
			</fieldset>
		</div>
	);
}
