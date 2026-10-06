import "./hud-stats.css";
import { useEffect, useState } from "react";
import { clockLabel } from "./clock";

const MINUTE_MS = 60_000;

/** `13:20` over `TUESDAY · AFTERNOON`; re-renders once a minute. */
export function HudClock() {
	const [minute, setMinute] = useState(() => Math.floor(Date.now() / MINUTE_MS));
	useEffect(() => {
		const timer = setInterval(() => setMinute(Math.floor(Date.now() / MINUTE_MS)), 1_000);
		return () => clearInterval(timer);
	}, []);
	const { time, caption } = clockLabel(new Date(minute * MINUTE_MS));
	return (
		<div className="hud-clock">
			<strong>{time}</strong>
			<small>{caption}</small>
		</div>
	);
}
