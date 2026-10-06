import type { ScreenChunk, ScreenPortMessage, ScreensApi } from "@shared/screens";

/** In-memory `ScreensApi`: records observe calls and lets tests emit port messages. */
export class FakeScreensApi implements ScreensApi {
	readonly calls: string[] = [];
	readonly portListeners = new Set<(message: ScreenPortMessage) => void>();

	observe(subscriberId: string, paneId: string): void {
		this.calls.push(`observe ${subscriberId} ${paneId}`);
	}
	unobserve(subscriberId: string, paneId: string): void {
		this.calls.push(`unobserve ${subscriberId} ${paneId}`);
	}
	open(): Promise<string> {
		return Promise.resolve("t1");
	}
	send(): void {}
	close(): void {}
	onMessage(listener: (message: ScreenPortMessage) => void): () => void {
		this.portListeners.add(listener);
		return () => this.portListeners.delete(listener);
	}
	emit(message: ScreenPortMessage): void {
		for (const listener of this.portListeners) listener(message);
	}
}

export function textChunk(
	kind: ScreenChunk["kind"],
	id: string,
	text: string,
	reset = false,
): ScreenChunk {
	return { kind, id, reset, cols: 80, rows: 24, data: new TextEncoder().encode(text) };
}
