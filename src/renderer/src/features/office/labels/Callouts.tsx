import "./labels.css";
import { Html } from "@react-three/drei";
import type { Callout } from "@shared/layout/schema";

/** Overlay cards never steal clicks from the 3D scene beneath them. */
const OVERLAY_STYLE = { pointerEvents: "none" } as const;

function CalloutCard({ callout }: { readonly callout: Callout }) {
	const { position, height, subtitle } = callout;
	return (
		<Html
			position={[position.x, height, position.z]}
			center
			zIndexRange={[20, 10]}
			style={OVERLAY_STYLE}
		>
			<div className={`callout-card callout-card-${callout.tone}`}>
				<strong>{callout.title}</strong>
				{subtitle ? <span>{subtitle}</span> : null}
			</div>
		</Html>
	);
}

/** The layout's floating callout cards (e.g. ACCESS over the server rack). Zones have no label in the office. */
export function Callouts({ callouts }: { readonly callouts: readonly Callout[] }) {
	return (
		<>
			{callouts.map((callout) => (
				<CalloutCard key={callout.id} callout={callout} />
			))}
		</>
	);
}
