import type { AvatarStyle, HairStyle } from "@shared/avatar/style";
import type { ReactNode } from "react";

/** Face centre and radius in the 64×64 viewBox. */
const CX = 32;
const CY = 36;
const R = 15;
const INK = "#2a2522";

/** Shown while the chief's look hasn't loaded: a neutral, featureless-coloured head. */
const NEUTRAL: AvatarStyle = {
	skin: "#ecbc98",
	hair: { style: "short", color: "#9a958e" },
	outfit: { style: "tee", color: "#9a958e", accent: "#e2d8c6" },
	pants: "#5c6470",
	shoes: "#2a2522",
	eyes: "dot",
	brows: "flat",
	mouth: "flat",
};

/** Hair drawn behind the face: volume and length. */
function HairBack({ style, color }: { readonly style: HairStyle; readonly color: string }) {
	switch (style) {
		case "afro":
			return <circle cx={CX} cy={CY - 5} r={R + 7} fill={color} />;
		case "curly":
			return (
				<g fill={color}>
					{[-13, -6, 0, 6, 13].map((dx) => (
						<circle key={dx} cx={CX + dx} cy={CY - 13 + Math.abs(dx) / 2} r={7} />
					))}
				</g>
			);
		case "bob":
			return (
				<rect x={CX - R - 2} y={CY - 10} width={(R + 2) * 2} height={20} rx={6} fill={color} />
			);
		case "long":
			return (
				<rect x={CX - R - 2} y={CY - 10} width={(R + 2) * 2} height={27} rx={6} fill={color} />
			);
		case "ponytail":
			return <ellipse cx={CX + R + 2} cy={CY - 2} rx={4.5} ry={8} fill={color} />;
		case "bun":
			return <circle cx={CX} cy={CY - R - 4} r={6} fill={color} />;
		case "pigtails":
			return (
				<g fill={color}>
					<ellipse cx={CX - R - 4} cy={CY + 1} rx={4} ry={7} />
					<ellipse cx={CX + R + 4} cy={CY + 1} rx={4} ry={7} />
				</g>
			);
		case "braids":
			return (
				<g fill={color}>
					<rect x={CX - R - 1} y={CY - 4} width={5} height={24} rx={2.5} />
					<rect x={CX + R - 4} y={CY - 4} width={5} height={24} rx={2.5} />
				</g>
			);
		case "sideSwept":
			return <rect x={CX + R - 5} y={CY - 10} width={7} height={22} rx={3} fill={color} />;
		case "bowl":
			return (
				<rect x={CX - R - 2} y={CY - 13} width={(R + 2) * 2} height={17} rx={8} fill={color} />
			);
		default:
			return null;
	}
}

/** Hair drawn over the face: the cap and fringe. */
function HairFront({ style, color }: { readonly style: HairStyle; readonly color: string }) {
	const top = CY - R;
	const fringe = `M${CX - R} ${CY} Q${CX - R} ${top - 1} ${CX} ${top - 1} Q${CX + R} ${top - 1} ${CX + R} ${CY}`;
	const buzz = (
		<path d={`${fringe} Q${CX} ${CY - 11} ${CX - R} ${CY}Z`} fill={color} opacity={0.7} />
	);
	switch (style) {
		case "bald":
			return null;
		case "buzz":
			return buzz;
		case "flatTop":
			return (
				<>
					{buzz}
					<rect x={CX - R + 2} y={top - 9} width={(R - 2) * 2} height={13} rx={1} fill={color} />
				</>
			);
		case "pompadour":
			return (
				<>
					{buzz}
					<ellipse cx={CX + 2} cy={top - 2} rx={12} ry={6} fill={color} />
				</>
			);
		case "undercut":
			return (
				<>
					{buzz}
					<path
						d={`M${CX - R + 3} ${top + 3} L${CX - R + 3} ${top - 4} L${CX + R - 3} ${top - 4} L${CX + R - 3} ${CY - 7} L${CX - 4} ${top + 4}Z`}
						fill={color}
					/>
				</>
			);
		case "twists":
			return (
				<>
					{buzz}
					<g fill={color}>
						{[-10, -5, 0, 5, 10].map((dx) => (
							<rect key={dx} x={CX + dx - 2} y={top - 7} width={4} height={10} rx={2} />
						))}
					</g>
				</>
			);
		case "bowl":
			return (
				<rect x={CX - R - 1} y={top - 3} width={(R + 1) * 2} height={14} rx={7} fill={color} />
			);
		case "mohawk":
			return <rect x={CX - 3} y={top - 7} width={6} height={13} rx={3} fill={color} />;
		case "spiky":
			return (
				<path
					d={`M${CX - R} ${CY - 4} L${CX - 12} ${top - 6} L${CX - 6} ${top} L${CX} ${top - 8} L${CX + 6} ${top} L${CX + 12} ${top - 6} L${CX + R} ${CY - 4} Q${CX} ${CY - 12} ${CX - R} ${CY - 4}Z`}
					fill={color}
				/>
			);
		case "sidePart":
			return (
				<path
					d={`${fringe} Q${CX + 6} ${CY - 12} ${CX - 4} ${CY - 9} Q${CX - 10} ${CY - 8} ${CX - R} ${CY}Z`}
					fill={color}
				/>
			);
		default:
			return (
				<path
					d={`${fringe} Q${CX + 8} ${CY - 8} ${CX} ${CY - 9} Q${CX - 8} ${CY - 8} ${CX - R} ${CY}Z`}
					fill={color}
				/>
			);
	}
}

function Eyes({ style }: { readonly style: AvatarStyle["eyes"] }) {
	return (
		<g fill={INK} stroke={INK} strokeLinecap="round">
			{[CX - 6, CX + 6].map((x) => {
				if (style === "sleepy")
					return (
						<path
							key={x}
							d={`M${x - 2} ${CY} Q${x} ${CY + 1.5} ${x + 2} ${CY}`}
							fill="none"
							strokeWidth={1.4}
						/>
					);
				if (style === "oval")
					return <ellipse key={x} cx={x} cy={CY} rx={1.5} ry={2.3} stroke="none" />;
				return <circle key={x} cx={x} cy={CY} r={style === "wide" ? 2.3 : 1.7} stroke="none" />;
			})}
		</g>
	);
}

function Brows({ style, color }: { readonly style: AvatarStyle["brows"]; readonly color: string }) {
	const y = style === "raised" ? CY - 7 : CY - 5.5;
	const tilt = style === "angled" ? 1.5 : 0;
	return (
		<g stroke={color} strokeWidth={style === "thick" ? 2.2 : 1.3} strokeLinecap="round">
			<path d={`M${CX - 8.5} ${y - tilt} L${CX - 3.5} ${y + tilt}`} />
			<path d={`M${CX + 3.5} ${y + tilt} L${CX + 8.5} ${y - tilt}`} />
		</g>
	);
}

function Mouth({ style }: { readonly style: AvatarStyle["mouth"] }) {
	const y = CY + 7;
	switch (style) {
		case "grin":
			return <path d={`M${CX - 5} ${y} Q${CX} ${y + 6} ${CX + 5} ${y}Z`} fill={INK} />;
		case "open":
			return <ellipse cx={CX} cy={y + 1} rx={2.2} ry={2.6} fill={INK} />;
		case "flat":
			return (
				<path
					d={`M${CX - 3.5} ${y + 1} L${CX + 3.5} ${y + 1}`}
					stroke={INK}
					strokeWidth={1.4}
					strokeLinecap="round"
				/>
			);
		case "smirk":
			return (
				<path
					d={`M${CX - 4} ${y + 1} Q${CX + 1} ${y + 2.5} ${CX + 4.5} ${y - 1}`}
					stroke={INK}
					strokeWidth={1.4}
					fill="none"
					strokeLinecap="round"
				/>
			);
		default:
			return (
				<path
					d={`M${CX - 4} ${y} Q${CX} ${y + 3.5} ${CX + 4} ${y}`}
					stroke={INK}
					strokeWidth={1.4}
					fill="none"
					strokeLinecap="round"
				/>
			);
	}
}

function Glasses({ style }: { readonly style: NonNullable<AvatarStyle["glasses"]> }) {
	const shades = style === "shades";
	const lens = (x: number): ReactNode =>
		style === "round" ? (
			<circle key={x} cx={x} cy={CY} r={4} />
		) : (
			<rect key={x} x={x - 4.5} y={CY - 3.2} width={9} height={6.4} rx={shades ? 2.5 : 1.2} />
		);
	return (
		<g stroke={INK} strokeWidth={1.2} fill={shades ? INK : "rgb(255 255 255 / 0.25)"}>
			{lens(CX - 6)}
			{lens(CX + 6)}
			<path d={`M${CX - 2} ${CY - 0.5} L${CX + 2} ${CY - 0.5}`} fill="none" />
		</g>
	);
}

function Headwear({ headwear }: { readonly headwear: NonNullable<AvatarStyle["headwear"]> }) {
	const { style, color } = headwear;
	const top = CY - R;
	const dome = `M${CX - R - 1} ${CY - 5} Q${CX - R} ${top - 3} ${CX} ${top - 3} Q${CX + R} ${top - 3} ${CX + R + 1} ${CY - 5}Z`;
	switch (style) {
		case "cap":
			return (
				<g fill={color}>
					<path d={dome} />
					<rect x={CX - 4} y={CY - 7} width={R + 10} height={3.2} rx={1.6} />
				</g>
			);
		case "beanie":
			return (
				<g fill={color}>
					<path d={dome} />
					<rect
						x={CX - R - 1.5}
						y={CY - 8}
						width={(R + 1.5) * 2}
						height={4.5}
						rx={2}
						opacity={0.85}
					/>
				</g>
			);
		case "headphones":
			return (
				<g>
					<path
						d={`M${CX - R - 1} ${CY} Q${CX - R} ${top - 4} ${CX} ${top - 4} Q${CX + R} ${top - 4} ${CX + R + 1} ${CY}`}
						fill="none"
						stroke={INK}
						strokeWidth={2.2}
					/>
					<rect x={CX - R - 4} y={CY - 4} width={6} height={9} rx={2.5} fill={color} />
					<rect x={CX + R - 2} y={CY - 4} width={6} height={9} rx={2.5} fill={color} />
				</g>
			);
		default:
			return <rect x={CX - R} y={CY - 10} width={R * 2} height={4} rx={2} fill={color} />;
	}
}

export interface ChiefAvatarProps {
	/** The chief's roster look; null draws a neutral head while it loads. */
	readonly style: AvatarStyle | null;
	/** Rendered width and height in CSS pixels. */
	readonly size: number;
}

/** A flat Mii head in a soft disc, drawn from the same AvatarStyle as the 3D character. */
export function ChiefAvatar({ style, size }: ChiefAvatarProps) {
	const look = style ?? NEUTRAL;
	const hairColor = look.hair.color;
	return (
		<svg className="chief-avatar" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
			<circle cx={32} cy={32} r={32} fill="#dfe8dc" />
			<path
				d={`M${CX - 16} 64 Q${CX - 15} ${CY + 14} ${CX} ${CY + 14} Q${CX + 15} ${CY + 14} ${CX + 16} 64Z`}
				fill={look.outfit.color}
			/>
			<HairBack style={look.hair.style} color={hairColor} />
			<circle cx={CX - R} cy={CY + 1} r={3} fill={look.skin} />
			<circle cx={CX + R} cy={CY + 1} r={3} fill={look.skin} />
			<circle cx={CX} cy={CY} r={R} fill={look.skin} />
			{look.headwear?.style !== "cap" && look.headwear?.style !== "beanie" && (
				<HairFront style={look.hair.style} color={hairColor} />
			)}
			{look.headwear && <Headwear headwear={look.headwear} />}
			<Brows style={look.brows} color={look.hair.style === "bald" ? INK : hairColor} />
			<Eyes style={look.eyes} />
			{look.glasses && <Glasses style={look.glasses} />}
			<Mouth style={look.mouth} />
			<circle cx={CX - 9} cy={CY + 5} r={2.4} fill="#e8836b" opacity={0.22} />
			<circle cx={CX + 9} cy={CY + 5} r={2.4} fill="#e8836b" opacity={0.22} />
		</svg>
	);
}
