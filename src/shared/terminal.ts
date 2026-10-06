/**
 * Commands accepted on stdin by `herdr terminal session control`, one JSON
 * object per line (protocol 22, discovered from herdr 0.9.3).
 */
export type ScrollDirection = "up" | "down";
export type MouseButton = "left" | "right" | "middle";
export type MouseAction = "down" | "up" | "drag" | "move";

/** Zero-based cell position inside the terminal grid. */
export interface CellPosition {
	readonly column: number;
	readonly row: number;
}

export type TerminalCommand =
	| { readonly type: "terminal.input"; readonly text: string }
	| { readonly type: "terminal.resize"; readonly cols: number; readonly rows: number }
	| {
			readonly type: "terminal.scroll";
			readonly direction: ScrollDirection;
			readonly lines: number;
			readonly source: "wheel" | "page_key";
			readonly column?: number | undefined;
			readonly row?: number | undefined;
	  }
	| {
			readonly type: "terminal.mouse";
			readonly action: MouseAction;
			readonly button: MouseButton;
			readonly column: number;
			readonly row: number;
	  }
	| { readonly type: "terminal.release" };

export interface TerminalOpenRequest {
	readonly paneId: string;
	readonly cols: number;
	readonly rows: number;
	/** Detach any other client already controlling this pane. */
	readonly takeover: boolean;
}
