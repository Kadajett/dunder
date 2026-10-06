import type { GlassesStyle, HeadwearStyle } from "@shared/avatar/style";
import { GEO, HEAD_R } from "./geometry";
import { Part } from "./Part";

const FRAME_COLOR: Record<GlassesStyle, string> = {
	round: "#b8893b",
	square: "#3a2c25",
	shades: "#24242a",
};

/** Glasses in skull space, floating just in front of the eyes. */
export function Glasses({ style }: { style: GlassesStyle }) {
	const color = FRAME_COLOR[style];
	return (
		<group position={[0, 0.015, 0.232]}>
			{([1, -1] as const).map((side) => (
				<group key={side} position={[side * 0.078, 0, 0]} rotation={[0, side * 0.3, 0]}>
					{style === "round" ? <Part geometry={GEO.lensRound} color={color} /> : null}
					{style === "square" ? (
						<Part geometry={GEO.lensSquare} color={color} rotation={[0, 0, Math.PI / 4]} />
					) : null}
					{style === "shades" ? <Part geometry={GEO.shades} color={color} /> : null}
				</group>
			))}
			<Part geometry={GEO.bridge} color={color} position={[0, 0.008, 0.006]} />
		</group>
	);
}

const CUSHION = "#2e2a28";

/** Hat or headphones in skull space; sized to sit over any hat-compatible hairstyle. */
export function Headwear({ style, color }: { style: HeadwearStyle; color: string }) {
	switch (style) {
		case "cap":
			return (
				<group rotation={[-0.3, 0, 0]}>
					<Part geometry={GEO.capDome} color={color} doubleSided />
					<Part
						geometry={GEO.brim}
						color={color}
						position={[0, 0.09, 0.11]}
						rotation={[0.3, 0, 0]}
					/>
					<Part geometry={GEO.button} color={color} position={[0, HEAD_R * 1.1, 0]} />
				</group>
			);
		case "beanie":
			return (
				<group rotation={[-0.35, 0, 0]}>
					<Part geometry={GEO.beanieDome} color={color} doubleSided />
					<Part geometry={GEO.beanieCuff} color={color} position={[0, 0.03, 0]} doubleSided />
					<Part geometry={GEO.pom} color={color} position={[0, HEAD_R * 1.1 + 0.04, 0]} />
				</group>
			);
		case "headphones":
			return (
				<>
					<Part geometry={GEO.headband} color={color} />
					{([1, -1] as const).map((side) => (
						<group key={side} position={[side * HEAD_R * 1.1, -0.01, 0]}>
							<Part geometry={GEO.earCup} color={color} rotation={[0, 0, Math.PI / 2]} />
							<Part
								geometry={GEO.earCup}
								color={CUSHION}
								position={[-side * 0.03, 0, 0]}
								rotation={[0, 0, Math.PI / 2]}
								scale={[0.85, 0.4, 0.85]}
							/>
						</group>
					))}
				</>
			);
		case "bandana":
			return (
				<group position={[0, 0.1, -0.01]} rotation={[-0.3, 0, 0]}>
					<Part geometry={GEO.bandana} color={color} scale={[0.9, 1, 0.9]} doubleSided />
					<Part geometry={GEO.curl} color={color} position={[0, -0.01, -0.25]} scale={0.7} />
				</group>
			);
	}
}
