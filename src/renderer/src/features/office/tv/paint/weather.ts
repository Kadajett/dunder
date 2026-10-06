import type { WeatherFeed, WeatherReport } from "@shared/tv";
import { describeWeather, forecastDayLabel, weatherQuip } from "../weather-codes";
import { BODY_TOP, font, hhmm, INK, MARGIN, type Pen, SCREEN_H, SCREEN_W } from "./kit";
import { paintSky } from "./sky-glyphs";

const FORECAST_LEFT = 800;

const degrees = (value: number): string => `${Math.round(value)}°`;

function paintNow(pen: Pen, report: WeatherReport, now: number): void {
	const { current } = report;
	const conditions = describeWeather(current.code);
	paintSky(pen, conditions.sky, [MARGIN + 130, BODY_TOP + 130], 230);
	pen.text(degrees(current.temperatureF), [MARGIN + 290, BODY_TOP + 196], {
		font: font(800, 168, "ui"),
		color: INK.cream,
	});
	pen.text(conditions.label, [MARGIN + 10, BODY_TOP + 316], {
		font: font(800, 52, "ui"),
		color: INK.cream,
	});
	const detail = `feels ${degrees(current.feelsLikeF)} · wind ${Math.round(current.windMph)} mph`;
	pen.text(detail, [MARGIN + 10, BODY_TOP + 366], { font: font(400, 32, "mono"), color: INK.dim });
	pen.panel([MARGIN, BODY_TOP + 404, FORECAST_LEFT - MARGIN - 40, 104], "#33405a");
	pen.text(weatherQuip(conditions.sky, now), [MARGIN + 28, BODY_TOP + 468], {
		font: font(700, 29, "ui"),
		color: INK.cream,
		maxWidth: FORECAST_LEFT - MARGIN - 96,
	});
}

function paintForecast(pen: Pen, report: WeatherReport): void {
	const width = SCREEN_W - MARGIN - FORECAST_LEFT;
	report.days.slice(0, 4).forEach((day, row) => {
		const top = BODY_TOP + row * 128;
		pen.panel([FORECAST_LEFT, top, width, 112], row === 0 ? "#344055" : INK.panel);
		pen.text(forecastDayLabel(day.date, row), [FORECAST_LEFT + 24, top + 68], {
			font: font(700, 32, "mono"),
			color: INK.cream,
		});
		paintSky(pen, describeWeather(day.code).sky, [FORECAST_LEFT + 190, top + 54], 76);
		const right = SCREEN_W - MARGIN - 24;
		const temps = font(700, 36, "mono");
		pen.text(degrees(day.lowF), [right, top + 70], { font: temps, color: INK.dim, align: "right" });
		pen.text(degrees(day.highF), [right - 92, top + 70], {
			font: temps,
			color: INK.cream,
			align: "right",
		});
	});
}

function paintFooter(pen: Pen, feed: WeatherFeed, report: WeatherReport): void {
	const fetched = new Date(report.fetchedAt);
	const status = feed.error ? "stale · retrying" : "open-meteo";
	const line = `updated ${hhmm(fetched.getHours(), fetched.getMinutes())} · ${status}`;
	pen.text(line, [SCREEN_W - MARGIN, SCREEN_H - 30], {
		font: font(400, 24, "mono"),
		color: INK.faint,
		align: "right",
	});
}

/** SF WEATHER: current conditions, a 4-day forecast and a rotating fog joke. */
export function paintWeather(pen: Pen, feed: WeatherFeed | null, now: number): void {
	const report = feed?.report;
	if (!feed || !report) {
		paintSky(pen, "fog", [SCREEN_W / 2, SCREEN_H / 2 - 50], 220);
		const message = feed?.error ? "weather is lost in the fog" : "fetching the fog…";
		pen.text(message, [SCREEN_W / 2, SCREEN_H / 2 + 150], {
			font: font(700, 50, "ui"),
			color: INK.dim,
			align: "center",
		});
		return;
	}
	paintNow(pen, report, now);
	paintForecast(pen, report);
	paintFooter(pen, feed, report);
}
