import type { AppError } from "@shared/app-errors";
import { create } from "zustand";
import { sendToChief } from "../chief/chat-store";
import { errorForMax, type ToldState } from "./error-text";

/** Kept for the window's life, so the card still says so after the inbox closes and opens. */
export const useToldMax = create<{ readonly told: Readonly<Record<string, ToldState>> }>(() => ({
	told: {},
}));

const set = (id: string, told: ToldState): void =>
	useToldMax.setState((state) => ({ told: { ...state.told, [id]: told } }));

/** Hand the error to Max in the chief chat (message, where, count, stack head). */
export async function tellMaxAbout(error: AppError): Promise<void> {
	set(error.id, { state: "sending" });
	const result = await sendToChief(errorForMax(error));
	set(
		error.id,
		result.state === "rejected"
			? { state: "failed", reason: result.reason ?? "Max couldn't take it" }
			: { state: "sent", count: error.count },
	);
}
