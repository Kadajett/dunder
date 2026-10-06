import { useLayoutEffect, useMemo, useRef } from "react";
import { Color, type InstancedMesh, Object3D } from "three";
import { SPINES } from "./palette";

export interface ShelfRow {
	/** Height of the shelf board surface the books stand on. */
	readonly y: number;
	/** Usable height above the board. */
	readonly clearance: number;
}

interface Book {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
	readonly color: string;
}

/** Deterministic PRNG (mulberry32) so every bookshelf looks the same on each render. */
function seededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function fillRow(row: ShelfRow, span: number, random: () => number): Book[] {
	const books: Book[] = [];
	let x = -span / 2 + 0.02;
	const end = span / 2 - 0.02;
	while (x < end) {
		if (random() < 0.08) {
			x += 0.12 + random() * 0.1;
			continue;
		}
		const width = Math.min(0.045 + random() * 0.05, end - x);
		if (width < 0.03) break;
		const height = row.clearance * (0.62 + random() * 0.3);
		const color = SPINES[Math.floor(random() * SPINES.length)] ?? SPINES[0];
		books.push({ x: x + width / 2, y: row.y + height / 2, width, height, color });
		x += width + 0.004;
	}
	return books;
}

function buildBooks(rows: readonly ShelfRow[], span: number, seed: number): Book[] {
	const random = seededRandom(seed);
	return rows.flatMap((row) => fillRow(row, span, random));
}

interface BookRowsProps {
	readonly rows: readonly ShelfRow[];
	/** Inner width available along x. */
	readonly span: number;
	/** Book depth along z; books are centred on z = `z`. */
	readonly depth: number;
	readonly z: number;
	readonly seed: number;
}

/** Rows of multicoloured books drawn as a single instanced mesh. */
export function BookRows(props: BookRowsProps) {
	const { rows, span, depth, z, seed } = props;
	const books = useMemo(() => buildBooks(rows, span, seed), [rows, span, seed]);
	const ref = useRef<InstancedMesh>(null);

	useLayoutEffect(() => {
		const mesh = ref.current;
		if (!mesh) return;
		const dummy = new Object3D();
		const color = new Color();
		books.forEach((book, i) => {
			dummy.position.set(book.x, book.y, z);
			dummy.scale.set(book.width, book.height, depth);
			dummy.updateMatrix();
			mesh.setMatrixAt(i, dummy.matrix);
			mesh.setColorAt(i, color.set(book.color));
		});
		mesh.instanceMatrix.needsUpdate = true;
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
		mesh.computeBoundingSphere();
	}, [books, depth, z]);

	return (
		<instancedMesh ref={ref} args={[undefined, undefined, books.length]} castShadow receiveShadow>
			<boxGeometry args={[1, 1, 1]} />
			<meshStandardMaterial flatShading roughness={0.9} />
		</instancedMesh>
	);
}
