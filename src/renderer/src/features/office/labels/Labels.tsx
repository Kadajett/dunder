import "./labels.css";
import { Html } from "@react-three/drei";
import type { AgentStatus } from "@shared/herdr/schema";
import { type AgentModel, shortModelName } from "@shared/models";
import { useSelection } from "../interaction/selection-store";
import { useModels } from "../models/models-store";

type Vec3 = readonly [number, number, number];

/** Overlay cards never steal clicks from the 3D scene beneath them. */
const OVERLAY_STYLE = { pointerEvents: "none" } as const;

export function ZoneCard(props: {
	readonly position: Vec3;
	readonly title: string;
	readonly subtitle?: string | undefined;
	/** A live figure shown in green after the subtitle, as the reference does. */
	readonly highlight?: string | undefined;
	readonly tone?: "light" | "dark" | "accent";
}) {
	const { subtitle, highlight } = props;
	return (
		<Html position={props.position} center zIndexRange={[20, 10]} style={OVERLAY_STYLE}>
			<div className={`zone-card zone-card-${props.tone ?? "light"}`}>
				<strong>{props.title}</strong>
				{subtitle || highlight ? (
					<span>
						{subtitle}
						{subtitle && highlight ? " · " : null}
						{highlight ? <em>{highlight}</em> : null}
					</span>
				) : null}
			</div>
		</Html>
	);
}

/** `opus 5.5 · high`, with a pending switch shown as `→ sonnet 5.5`. */
function modelLabel(model: AgentModel | undefined): string | undefined {
	if (!model) return undefined;
	if (model.pending) return `→ ${shortModelName(model.pending.model)}`;
	const name = shortModelName(model.model);
	return model.thinking ? `${name} · ${model.thinking}` : name;
}

/** Clickable: the tag is the easiest target on a moving character. */
export function NameTag(props: {
	readonly position: Vec3;
	readonly name: string;
	readonly status: AgentStatus;
	readonly paneId: string;
}) {
	const model = useModels((state) => state.live[props.name]);
	const select = useSelection((state) => state.select);
	const label = modelLabel(model);
	return (
		<Html position={props.position} center zIndexRange={[40, 30]}>
			<button
				type="button"
				className="name-tag"
				data-status={props.status}
				title={`${props.name}: ${model?.model ?? "model unknown"} — click for details and model switching`}
				onClick={(event) => {
					// The tag lives inside R3F's event source; without this the click also
					// reaches the canvas, misses every mesh and clears the selection again.
					event.stopPropagation();
					select({ kind: "agent", paneId: props.paneId });
				}}
			>
				<i className={`status-dot status-${props.status}`} />
				<span>{props.name.toUpperCase()}</span>
				{label ? <small data-pending={model?.pending !== undefined}>{label}</small> : null}
			</button>
		</Html>
	);
}
