import type { TLDefaultColorStyle, TLDefaultSizeStyle } from "@tldraw/tlschema";

/** tldraw's light-theme solid colours. */
export const SOLID: Record<TLDefaultColorStyle, string> = {
	black: "#1d1d1d",
	grey: "#9fa8b2",
	"light-violet": "#e085f4",
	violet: "#ae3ec9",
	blue: "#4465e9",
	"light-blue": "#4ba1f1",
	yellow: "#f1ac4b",
	orange: "#e16919",
	green: "#099268",
	"light-green": "#4cb05e",
	"light-red": "#f87777",
	red: "#e03131",
	white: "#ffffff",
};

/** tldraw's stroke widths and font sizes per size style, in page units. */
export const STROKE_PX: Record<TLDefaultSizeStyle, number> = { s: 2, m: 3.5, l: 5, xl: 10 };
export const FONT_PX: Record<TLDefaultSizeStyle, number> = { s: 18, m: 24, l: 36, xl: 44 };
