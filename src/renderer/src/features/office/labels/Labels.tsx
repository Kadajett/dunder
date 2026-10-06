import { Html } from "@react-three/drei";
import type { AgentStatus } from "@shared/herdr/schema";

type Vec3 = readonly [number, number, number];

/** Overlay cards never steal clicks from the 3D scene beneath them. */
const OVERLAY_STYLE = { pointerEvents: "none" } as const;

export function ZoneCard(props: {
	readonly position: Vec3;
	readonly title: string;
	readonly subtitle?: string | undefined;
	readonly tone?: "light" | "dark" | "accent";
}) {
	return (
		<Html position={props.position} center zIndexRange={[20, 10]} style={OVERLAY_STYLE}>
			<div className={`zone-card zone-card-${props.tone ?? "light"}`}>
				<strong>{props.title}</strong>
				{props.subtitle ? <span>{props.subtitle}</span> : null}
			</div>
		</Html>
	);
}

export function NameTag(props: {
	readonly position: Vec3;
	readonly name: string;
	readonly status: AgentStatus;
}) {
	return (
		<Html position={props.position} center zIndexRange={[40, 30]} style={OVERLAY_STYLE}>
			<div className="name-tag" data-status={props.status}>
				<i className={`status-dot status-${props.status}`} />
				{props.name.toUpperCase()}
			</div>
		</Html>
	);
}
