import type {
	ScreenChunk,
	ScreenPortMessage,
	ScreenStatus,
	ScreenStreamKind,
} from "@shared/screens";
import type { PaneSize } from "./herdr-stream";

/** Bytes for one stream, all rendered at one grid size. */
export interface ScreenBytes extends PaneSize {
	readonly data: Uint8Array;
}

/** Where screen traffic for one renderer window goes. */
export interface ScreenSink {
	readonly ownerId: number;
	/** `reset` marks bytes that start a fresh screen (an attach or a replay). */
	write(kind: ScreenStreamKind, id: string, bytes: ScreenBytes, reset: boolean): void;
	status(status: ScreenStatus): void;
}

export interface WindowSink extends ScreenSink {
	/** Drop anything pending and stop sending. */
	dispose(): void;
}

interface PendingChunk extends PaneSize {
	readonly kind: ScreenStreamKind;
	readonly id: string;
	readonly reset: boolean;
	readonly parts: Uint8Array[];
}

export const COALESCE_MS = 16;

function toChunk(pending: PendingChunk): ScreenChunk {
	const total = pending.parts.reduce((sum, part) => sum + part.byteLength, 0);
	// Always a fresh, exact buffer: base64-decoded Buffers are views on a shared
	// pool, and structured clone would copy the whole pool.
	const data = new Uint8Array(total);
	let offset = 0;
	for (const part of pending.parts) {
		data.set(part, offset);
		offset += part.byteLength;
	}
	const { kind, id, reset, cols, rows } = pending;
	return { kind, id, reset, cols, rows, data };
}

/**
 * Batches each stream's bytes for `intervalMs` into `ScreenChunk`s. A reset
 * drops that stream's pending backlog, since the new bytes repaint everything.
 * Status messages flush first so they never overtake the bytes before them.
 */
export function createCoalescingSink(
	ownerId: number,
	post: (message: ScreenPortMessage) => void,
	intervalMs = COALESCE_MS,
): WindowSink {
	let pending: PendingChunk[] = [];
	let timer: NodeJS.Timeout | undefined;
	let disposed = false;

	const flush = (): void => {
		clearTimeout(timer);
		timer = undefined;
		if (pending.length === 0 || disposed) return;
		const chunks = pending.map(toChunk);
		pending = [];
		post({ type: "chunks", chunks });
	};

	return {
		ownerId,
		write(kind, id, bytes, reset) {
			if (disposed) return;
			const sameStream = (chunk: PendingChunk): boolean => chunk.kind === kind && chunk.id === id;
			if (reset) pending = pending.filter((chunk) => !sameStream(chunk));
			const last = pending.findLast(sameStream);
			if (last && last.cols === bytes.cols && last.rows === bytes.rows) last.parts.push(bytes.data);
			else
				pending.push({ kind, id, reset, cols: bytes.cols, rows: bytes.rows, parts: [bytes.data] });
			timer ??= setTimeout(flush, intervalMs);
		},
		status(status) {
			if (disposed) return;
			flush();
			post({ type: "status", status });
		},
		dispose() {
			disposed = true;
			clearTimeout(timer);
			pending = [];
		},
	};
}
