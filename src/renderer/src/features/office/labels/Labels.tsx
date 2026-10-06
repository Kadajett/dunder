import "./labels.css";
import { Html } from "@react-three/drei";

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
