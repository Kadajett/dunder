export interface Box {
	readonly left: number;
	readonly top: number;
	readonly width: number;
	readonly height: number;
}

/**
 * The largest `aspect` (width / height) rectangle that fits inside `width × height`
 * after `padding` on every side, centred: bars go top/bottom or left/right.
 */
export function letterbox(width: number, height: number, aspect: number, padding = 0): Box {
	const roomW = Math.max(0, width - padding * 2);
	const roomH = Math.max(0, height - padding * 2);
	const fitW = Math.min(roomW, roomH * aspect);
	const fitH = fitW / aspect;
	return {
		left: Math.round((width - fitW) / 2),
		top: Math.round((height - fitH) / 2),
		width: Math.round(fitW),
		height: Math.round(fitH),
	};
}
