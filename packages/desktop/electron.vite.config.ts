import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
	main: {
		plugins: [externalizeDepsPlugin({ exclude: ["@percho/backend", "@percho/shared"] })],
		build: {
			rollupOptions: {
				input: {
					index: resolve(__dirname, "src/main/index.ts"),
					// pty 宿主子进程（utilityProcess.fork 的入口）：node-pty 只在这个入口里被引用
					"pty-host-child": resolve(__dirname, "src/main/terminal/pty-host-child.ts"),
				},
				external: ["@earendil-works/pi-coding-agent"],
			},
		},
		resolve: {
			alias: {
				"@percho/backend": resolve(__dirname, "../backend/src/index.ts"),
				"@percho/shared": resolve(__dirname, "../shared/src/index.ts"),
			},
		},
	},
	preload: {
		plugins: [externalizeDepsPlugin({ exclude: ["@percho/shared"] })],
		build: {
			rollupOptions: {
				output: {
					format: "cjs",
					entryFileNames: "index.cjs",
				},
			},
		},
		resolve: {
			alias: {
				"@percho/shared": resolve(__dirname, "../shared/src/index.ts"),
			},
		},
	},
	renderer: {
		resolve: {
			alias: {
				"@percho/shared": resolve(__dirname, "../shared/src/index.ts"),
				"@renderer": resolve(__dirname, "src/renderer/src"),
			},
		},
		plugins: [react(), tailwindcss()],
	},
});
