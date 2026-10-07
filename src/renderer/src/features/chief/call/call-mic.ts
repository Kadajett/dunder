import { playPcm } from "./call-audio";
import { LiveMic, type LiveMicEvents, MIC_RATE } from "./live-mic";

/** Jeremy's chosen input (a MediaDeviceInfo deviceId); the default when unset. */
const MIC_KEY = "dunder.call.mic";
/** A mic test records this long and plays it straight back (no ElevenLabs). */
export const MIC_TEST_MS = 3_000;

export interface MicInput {
	readonly deviceId: string;
	readonly label: string;
}

export interface OpenedMic {
	readonly deviceId: string | undefined;
	readonly label: string;
	/** The chosen input was gone, so the default one opened instead. */
	readonly fellBack: boolean;
}

let mic: LiveMic | null = null;

export function savedMicId(): string | null {
	return globalThis.localStorage?.getItem(MIC_KEY) ?? null;
}

export function saveMicId(deviceId: string | null): void {
	if (deviceId) globalThis.localStorage?.setItem(MIC_KEY, deviceId);
	else globalThis.localStorage?.removeItem(MIC_KEY);
}

/** Opens (or reopens) the call's mic; throws getUserMedia's error for the caller to word. */
export async function openMic(deviceId: string | null, events: LiveMicEvents): Promise<OpenedMic> {
	closeMic();
	const opened = await LiveMic.open(deviceId, events);
	mic = opened.mic;
	return { deviceId: mic.deviceId, label: mic.label, fellBack: opened.fellBack };
}

export function closeMic(): void {
	mic?.close();
	mic = null;
}

/** Max's voice is playing: the detector needs Jeremy clearly louder than the speaker leak. */
export function setMicPlaying(playing: boolean): void {
	if (mic) mic.playing = playing;
}

export function setMicMuted(muted: boolean): void {
	mic?.setMuted(muted);
}

/** Records a few seconds from the open mic and plays them back; false without a mic. */
export async function testMic(): Promise<boolean> {
	const open = mic;
	if (!open) return false;
	const samples = await open.record(MIC_TEST_MS);
	open.playing = true;
	await playPcm(samples, MIC_RATE).finally(() => {
		open.playing = false;
	});
	return true;
}

/** Audio inputs; labels are empty until the mic has been allowed once. */
export async function listInputs(): Promise<readonly MicInput[]> {
	const devices = await navigator.mediaDevices.enumerateDevices();
	return devices
		.filter((device) => device.kind === "audioinput")
		.map((device, index) => ({
			deviceId: device.deviceId,
			label: device.label || `Microphone ${index + 1}`,
		}));
}
