import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { IPC } from "@shared/ipc";
import { type VoiceResult, voiceAudioSchema, voiceSpeakSchema } from "@shared/voice";
import { ipcMain } from "electron";
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

/** `window.office.voice` handlers. Renderer payloads are untrusted; the key never leaves main. */
export function registerVoiceIpc(voice: ElevenLabsVoice): void {
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
}
