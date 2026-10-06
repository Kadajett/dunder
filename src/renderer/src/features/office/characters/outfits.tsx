import type { AvatarStyle, OutfitStyle } from "@shared/avatar/style";
import { GEO } from "./geometry";
import { Part } from "./Part";

type Outfit = AvatarStyle["outfit"];
type Vec3 = [number, number, number];

const SHIRT_WHITE = "#f4f1ea";
const DARK_BUTTON = "#26221f";
const BRASS = "#e0b84a";
/** Torso depth squash: rounder from the front, flatter from the side. */
const TORSO_DEPTH = 0.8;

/** Garments worn over a shirt show the accent as the torso base colour. */
const SHIRT_UNDER: Record<OutfitStyle, boolean> = {
	tee: false,
	hoodie: false,
	suit: false,
	sweater: false,
	overalls: true,
	labCoat: false,
	polo: false,
	cardigan: true,
	jacket: false,
};

const SLEEVES: Record<OutfitStyle, { long: boolean; cuff: "accent" | "shirt" | null }> = {
	tee: { long: false, cuff: null },
	hoodie: { long: true, cuff: "accent" },
	suit: { long: true, cuff: "shirt" },
	sweater: { long: true, cuff: "accent" },
	overalls: { long: false, cuff: null },
	labCoat: { long: true, cuff: null },
	polo: { long: false, cuff: "accent" },
	cardigan: { long: true, cuff: null },
	jacket: { long: true, cuff: "accent" },
};

export interface Sleeve {
	long: boolean;
	color: string;
	cuff: string | null;
}

/** How an outfit dresses the arms. */
export function sleeveFor(outfit: Outfit): Sleeve {
	const sleeve = SLEEVES[outfit.style];
	const cuff = sleeve.cuff === "shirt" ? SHIRT_WHITE : sleeve.cuff && outfit.accent;
	return {
		long: sleeve.long,
		color: SHIRT_UNDER[outfit.style] && !sleeve.long ? outfit.accent : outfit.color,
		cuff,
	};
}

/** Suits and overalls come with matching trousers. */
export function pantsColorFor(style: AvatarStyle): string {
	const matching = style.outfit.style === "suit" || style.outfit.style === "overalls";
	return matching ? style.outfit.color : style.pants;
}

/** A small box glued to the chest; `size` in metres. */
function Patch({
	color,
	at,
	size,
	tilt = 0,
}: { color: string; at: Vec3; size: Vec3 } & {
	tilt?: number;
}) {
	return (
		<Part geometry={GEO.panel} color={color} position={at} scale={size} rotation={[tilt, 0, 0]} />
	);
}

function Buttons({ color, at }: { color: string; at: Vec3[] }) {
	return (
		<>
			{at.map((position) => (
				<Part key={position.join()} geometry={GEO.button} color={color} position={position} />
			))}
		</>
	);
}

/** Wraps a garment ring/shell around the squashed torso. */
function Wrap({ geometry, color, y }: { geometry: typeof GEO.band; color: string; y: number }) {
	return (
		<Part
			geometry={geometry}
			color={color}
			position={[0, y, 0]}
			scale={[1, 1, TORSO_DEPTH]}
			doubleSided
		/>
	);
}

function ShirtFront({ tie }: { tie: string | null }) {
	return (
		<>
			<Patch color={SHIRT_WHITE} at={[0, 0.14, 0.108]} size={[0.09, 0.14, 0.03]} tilt={-0.4} />
			{tie ? (
				<>
					<Patch color={tie} at={[0, 0.17, 0.122]} size={[0.045, 0.035, 0.02]} tilt={-0.4} />
					<Patch color={tie} at={[0, 0.07, 0.138]} size={[0.036, 0.17, 0.014]} tilt={-0.12} />
				</>
			) : null}
		</>
	);
}

function TopDetails({ color, accent }: Outfit) {
	return (
		<>
			<Part geometry={GEO.collar} color={accent} position={[0, 0.215, 0]} />
			<Part
				geometry={GEO.disc}
				color={accent}
				position={[0.06, 0.05, 0.137]}
				rotation={[Math.PI / 2, 0, 0]}
			/>
			<Part
				geometry={GEO.disc}
				color={color}
				position={[0.06, 0.05, 0.142]}
				rotation={[Math.PI / 2, 0, 0]}
				scale={0.5}
			/>
		</>
	);
}

function OutfitDetails({ outfit }: { outfit: Outfit }) {
	const { color, accent } = outfit;
	switch (outfit.style) {
		case "tee":
			return <TopDetails {...outfit} />;
		case "polo":
			return (
				<>
					<Part geometry={GEO.collar} color={color} position={[0, 0.215, 0]} />
					<Patch color={accent} at={[0.04, 0.2, 0.08]} size={[0.07, 0.022, 0.06]} tilt={-0.6} />
					<Patch color={accent} at={[-0.04, 0.2, 0.08]} size={[0.07, 0.022, 0.06]} tilt={-0.6} />
					<Patch color={accent} at={[0, 0.13, 0.122]} size={[0.03, 0.09, 0.02]} tilt={-0.3} />
				</>
			);
		case "hoodie":
			return (
				<>
					<Part
						geometry={GEO.hood}
						color={color}
						position={[0, 0.2, -0.08]}
						rotation={[1.1, 0, 0]}
					/>
					<Part geometry={GEO.string} color={accent} position={[0.03, 0.12, 0.13]} />
					<Part geometry={GEO.string} color={accent} position={[-0.03, 0.12, 0.13]} />
					<Patch color={accent} at={[0, -0.08, 0.135]} size={[0.2, 0.08, 0.02]} />
				</>
			);
		case "suit":
			return (
				<>
					<ShirtFront tie={accent} />
					<Buttons
						color={DARK_BUTTON}
						at={[
							[0.0, -0.06, 0.135],
							[0.0, -0.11, 0.13],
						]}
					/>
				</>
			);
		case "sweater":
			return (
				<>
					<Part geometry={GEO.collar} color={accent} position={[0, 0.215, 0]} />
					<Wrap geometry={GEO.band} color={accent} y={0.0} />
					<Wrap geometry={GEO.band} color={accent} y={0.05} />
				</>
			);
		case "overalls":
			return (
				<>
					<Wrap geometry={GEO.hem} color={color} y={-0.12} />
					<Patch color={color} at={[0, 0.03, 0.13]} size={[0.2, 0.14, 0.02]} />
					<Patch color={color} at={[0.075, 0.15, 0.112]} size={[0.035, 0.12, 0.02]} tilt={-0.5} />
					<Patch color={color} at={[-0.075, 0.15, 0.112]} size={[0.035, 0.12, 0.02]} tilt={-0.5} />
					<Buttons
						color={BRASS}
						at={[
							[0.075, 0.095, 0.142],
							[-0.075, 0.095, 0.142],
						]}
					/>
				</>
			);
		case "labCoat":
			return (
				<>
					<ShirtFront tie={null} />
					<Wrap geometry={GEO.coatTail} color={color} y={-0.2} />
					<Patch color="#e2ddd2" at={[-0.07, 0.03, 0.137]} size={[0.07, 0.06, 0.012]} />
					<Patch color={accent} at={[-0.05, 0.07, 0.142]} size={[0.012, 0.05, 0.012]} />
					<Buttons
						color="#b9b4aa"
						at={[
							[0, -0.02, 0.138],
							[0, -0.08, 0.136],
						]}
					/>
				</>
			);
		case "cardigan":
			return (
				<>
					<Part geometry={GEO.collar} color={accent} position={[0, 0.215, 0]} />
					<Wrap geometry={GEO.cardigan} color={color} y={-0.02} />
					<Buttons
						color={SHIRT_WHITE}
						at={[
							[0.068, 0.06, 0.142],
							[0.068, 0.0, 0.142],
							[0.068, -0.06, 0.142],
						]}
					/>
				</>
			);
		case "jacket":
			return (
				<>
					<Part geometry={GEO.tallCollar} color={color} position={[0, 0.21, 0]} />
					<Patch color={accent} at={[0, 0.03, 0.137]} size={[0.014, 0.24, 0.012]} />
					<Patch color={accent} at={[0.08, -0.07, 0.136]} size={[0.07, 0.02, 0.02]} />
					<Patch color={accent} at={[-0.08, -0.07, 0.136]} size={[0.07, 0.02, 0.02]} />
					<Wrap geometry={GEO.band} color={accent} y={-0.05} />
				</>
			);
	}
}

/** Clothed torso, centred on the torso pivot (upper-body local). */
export function OutfitTorso({ outfit }: { outfit: Outfit }) {
	const base = SHIRT_UNDER[outfit.style] ? outfit.accent : outfit.color;
	return (
		<>
			<Part geometry={GEO.torso} color={base} scale={[1, 1, TORSO_DEPTH]} />
			<OutfitDetails outfit={outfit} />
		</>
	);
}
