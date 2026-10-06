import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const CONTRACT_TESTS = "src/**/*.contract.test.ts";

export default defineConfig({
	resolve: {
		alias: {
			"@shared": resolve(__dirname, "src/shared"),
			"@renderer": resolve(__dirname, "src/renderer/src"),
		},
	},
	test: {
		environment: "node",
		projects: [
			{
				extends: true,
				test: {
					name: "unit",
					include: [
						"src/**/*.test.ts",
						"site/src/**/*.test.ts",
						"scripts/**/*.test.mts",
						"packages/installer/src/**/*.test.ts",
					],
					exclude: [CONTRACT_TESTS],
				},
			},
			{
				// Against the real `office` herdr session: run with `npm run test:contract`.
				extends: true,
				test: {
					name: "contract",
					include: [CONTRACT_TESTS],
					testTimeout: 30_000,
					hookTimeout: 30_000,
					fileParallelism: false,
				},
			},
		],
	},
});
