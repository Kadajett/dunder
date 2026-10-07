import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { IPC } from "@shared/ipc";
import {
	callSnapshotSchema,
	type VoiceResult,
	voiceAudioSchema,
	voiceSpeakSchema,
} from "@shared/voice";
import { ipcMain } from "electron";
import { takeUpdateRelaunch } from "../app-update/relaunch-mark";
import { CallKeeper } from "./call-keeper";
import { readVoiceSetup } from "./config";
import { ElevenLabsVoice } from "./elevenlabs";

/** ElevenLabs over the real network, keyed from the environment or Jeremy's secrets file. */
export function createVoice(): ElevenLabsVoice {
	const secretsPath = join(homedir(), ".config", "friday-personal", "secrets.env");
	return new ElevenLabsVoice({
		fetch: (url, init) => fetch(url, init),
		setup: () => readVoiceSetup(process.env, () => readFile(secretsPath, "utf8")),
	});
}

const invalid = (reason: string): Promise<VoiceResult<never>> =>
	Promise.resolve({ ok: false, reason });

/** Jeremy's live call in `<userData>/call.json`, resumable after an update relaunch. */
export function createCallKeeper(userData: string): CallKeeper {
	return new CallKeeper({
		path: join(userData, "call.json"),
		relaunchedAt: () => takeUpdateRelaunch(userData),
		now: Date.now,
	});
}

/** `window.office.voice` handlers. Renderer payloads are untrusted; the key never leaves main. */
export function registerVoiceIpc(voice: ElevenLabsVoice, calls: CallKeeper): void {
	ipcMain.handle(IPC.voiceAvailable, () => voice.available());
	ipcMain.handle(IPC.voiceTranscribe, (_event, audio: unknown, mimeType: unknown) => {
		const parsed = voiceAudioSchema.safeParse({ audio, mimeType });
		if (!parsed.success)
			return invalid("That recording can't be sent (empty, too long or not audio)");
		return voice.transcribe(parsed.data.audio, parsed.data.mimeType);
	});
	ipcMain.handle(IPC.voiceSpeak, (_event, text: unknown) => {
		const parsed = voiceSpeakSchema.safeParse(text);
		if (!parsed.success) return invalid("Nothing to say, or too long to say");
		return voice.speak(parsed.data);
	});
	ipcMain.handle(IPC.voiceSaveCall, (_event, call: unknown) => {
		const parsed = callSnapshotSchema.nullable().safeParse(call);
		if (!parsed.success) return Promise.resolve();
		return calls.save(parsed.data);
	});
	ipcMain.handle(IPC.voiceResumeCall, () => calls.take());
}
