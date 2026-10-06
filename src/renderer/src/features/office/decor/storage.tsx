import { BookRows, type ShelfRow } from "./books";
import { PALETTE } from "./palette";
import { Block } from "./parts";

const BOARD = 0.05;
const BACK = 0.03;

interface FrameSpec {
	readonly width: number;
	readonly height: number;
	readonly depth: number;
	readonly cols: number;
	readonly rows: number;
	/** Height of the frame's bottom edge above the floor. */
	readonly bottom: number;
	readonly color: string;
	readonly backColor: string;
}

/** Height of each open cell between boards. */
function cellHeight(f: FrameSpec): number {
	return (f.height - BOARD * (f.rows + 1)) / f.rows;
}

function cellWidth(f: FrameSpec): number {
	return (f.width - BOARD * (f.cols + 1)) / f.cols;
}

/** Board surface y of row `i` (0 = bottom row). */
function rowFloor(f: FrameSpec, i: number): number {
	return f.bottom + BOARD + i * (cellHeight(f) + BOARD);
}

function colCentre(f: FrameSpec, i: number): number {
	return -f.width / 2 + BOARD + cellWidth(f) / 2 + i * (cellWidth(f) + BOARD);
}

/** Open box with a back panel, divided into `cols` × `rows` cells, front toward +z. */
function ShelfFrame({ f }: { readonly f: FrameSpec }) {
	const midY = f.bottom + f.height / 2;
	const boardDepth = f.depth - BACK;
	const boardZ = BACK / 2;
	const verticals = Array.from({ length: f.cols + 1 }, (_, i) => {
		return -f.width / 2 + BOARD / 2 + i * (cellWidth(f) + BOARD);
	});
	const horizontals = Array.from({ length: f.rows + 1 }, (_, i) => rowFloor(f, i) - BOARD / 2);
	return (
		<group>
			<Block
				size={[f.width, f.height, BACK]}
				position={[0, midY, -f.depth / 2 + BACK / 2]}
				color={f.backColor}
			/>
			{verticals.map((x) => (
				<Block
					key={`v${x}`}
					size={[BOARD, f.height, boardDepth]}
					position={[x, midY, boardZ]}
					color={f.color}
				/>
			))}
			{horizontals.map((y) => (
				<Block
					key={`h${y}`}
					size={[f.width, BOARD, boardDepth]}
					position={[0, y, boardZ]}
					color={f.color}
				/>
			))}
		</group>
	);
}

const PLINTH = 0.08;
const CROWN = 0.07;
const SHELF: FrameSpec = {
	width: 2,
	height: 2 - PLINTH - CROWN,
	depth: 0.45,
	cols: 1,
	rows: 3,
	bottom: PLINTH,
	color: PALETTE.shelfWood,
	backColor: PALETTE.shelfShadow,
};
const SHELF_ROWS: readonly ShelfRow[] = Array.from({ length: SHELF.rows }, (_, i) => ({
	y: rowFloor(SHELF, i),
	clearance: cellHeight(SHELF),
}));

/** Warm wood bookcase 2.0 × 0.45 × 2.0 with an overhanging top and rows of bright spines. */
export function Bookshelf() {
	return (
		<group>
			<Block
				size={[SHELF.width - 0.06, PLINTH, SHELF.depth - 0.04]}
				position={[0, PLINTH / 2, 0]}
				color={PALETTE.planterDark}
			/>
			<ShelfFrame f={SHELF} />
			<Block
				size={[SHELF.width + 0.08, CROWN, SHELF.depth + 0.06]}
				position={[0, 2 - CROWN / 2, 0.02]}
				color={PALETTE.shelfWoodLight}
			/>
			<BookRows
				rows={SHELF_ROWS}
				span={SHELF.width - BOARD * 2}
				depth={0.3}
				z={-SHELF.depth / 2 + BACK + 0.16}
				seed={7}
			/>
		</group>
	);
}

const CABINET = 0.72;
const CUBBY: FrameSpec = {
	width: 1.2,
	height: 0.78,
	depth: 0.4,
	cols: 4,
	rows: 3,
	bottom: CABINET,
	color: PALETTE.woodDark,
	backColor: PALETTE.woodDeep,
};

const ENVELOPES = [
	{ col: 0, row: 2, color: PALETTE.paper },
	{ col: 1, row: 0, color: "#d8b98a" },
	{ col: 2, row: 2, color: "#cfe0ea" },
	{ col: 3, row: 1, color: PALETTE.paper },
	{ col: 1, row: 1, color: PALETTE.cream },
] as const;

/** Envelopes lie flat in their slots and poke out past the front edge so they read from above. */
function Envelopes() {
	const width = cellWidth(CUBBY) * 0.7;
	const length = 0.24;
	const z = CUBBY.depth / 2 - length / 2 + 0.07;
	return (
		<group>
			{ENVELOPES.map((e) => (
				<Block
					key={`${e.col}:${e.row}`}
					size={[width, 0.014, length]}
					position={[colCentre(CUBBY, e.col), rowFloor(CUBBY, e.row) + 0.012, z]}
					rotation={[0, (e.col - 1.5) * 0.06, 0]}
					color={e.color}
					noShadow
				/>
			))}
		</group>
	);
}

/** Wooden pigeon-hole mail shelf on a closed cabinet, a few envelopes in the slots. */
export function MailCubby() {
	const doorWidth = CUBBY.width / 2 - 0.05;
	return (
		<group>
			<Block
				size={[CUBBY.width, CABINET, CUBBY.depth]}
				position={[0, CABINET / 2, 0]}
				color={PALETTE.woodDark}
			/>
			{[-1, 1].map((side) => (
				<group key={side}>
					<Block
						size={[doorWidth, CABINET - 0.12, 0.02]}
						position={[(side * CUBBY.width) / 4, CABINET / 2, CUBBY.depth / 2 + 0.01]}
						color={PALETTE.woodLight}
					/>
					<Block
						size={[0.03, 0.12, 0.03]}
						position={[side * 0.06, CABINET / 2 + 0.05, CUBBY.depth / 2 + 0.035]}
						color={PALETTE.brass}
						metalness={0.5}
						roughness={0.4}
					/>
				</group>
			))}
			<ShelfFrame f={CUBBY} />
			<Envelopes />
		</group>
	);
}
