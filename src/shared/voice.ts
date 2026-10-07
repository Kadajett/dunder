import { z } from "zod";
import { SPOKEN_MAX } from "./chief";

/** Where main looks for the ElevenLabs key; the tooltip and errors name it. */
export const VOICE_KEY_VAR = "ELEVENLABS_API_KEY";
export const VOICE_ID_VAR = "ELEVENLABS_VOICE_ID";
export const VOICE_SECRETS_FILE = "~/.config/friday-personal/secrets.env";

/** One push-to-talk turn caps at 60 s; this is far above what that records. */
export const VOICE_AUDIO_MAX_BYTES = 8 * 1024 * 1024;

export type VoiceAvailability =
	| { readonly available: true }
	/** `reason` says which variable is missing and where it is read from. */
	| { readonly available: false; readonly reason: string };

export type VoiceResult<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly reason: string };

export const voiceAudioSchema = z.object({
	audio: z
		.instanceof(Uint8Array)
		.refine((bytes) => bytes.byteLength > 0, "empty recording")
		.refine((bytes) => bytes.byteLength <= VOICE_AUDIO_MAX_BYTES, "recording too long"),
	mimeType: z
		.string()
		.max(100)
		.regex(/^audio\/[\w.+-]+(;.*)?$/),
});
export const voiceSpeakSchema = z.string().trim().min(1).max(SPOKEN_MAX);

/**
 * `window.office.voice`: ElevenLabs speech for calls with the chief. The key
 * stays in main; the renderer only sends audio or text and gets the result.
 */
export interface VoiceApi {
	available(): Promise<VoiceAvailability>;
	/** Speech to text (Scribe); an empty string when nothing was said. */
	transcribe(audio: Uint8Array, mimeType: string): Promise<VoiceResult<string>>;
	/** Text to speech: MP3 bytes in the chief's voice. */
	speak(text: string): Promise<VoiceResult<Uint8Array>>;
}
