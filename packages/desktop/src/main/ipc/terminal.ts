import {
	IpcChannels,
	TERMINAL_CHANNELS,
	type TerminalDataEvent,
	type TerminalExitEvent,
} from "@percho/shared";
import type { IPtyHost } from "../terminal/pty-service";
import { registerInvokeHandlers } from "./invoke";
import { sendToRenderer } from "./send";

/**
 * 终端域：node-pty 生命周期操作 + pty→renderer 单向事件桥。
 * PtyService 单例由 index.ts 装配传入（不依赖 PiBackend，与会话/pi 完全解耦）。
 */
export function registerTerminalIpc(pty: IPtyHost): void {
	registerInvokeHandlers(TERMINAL_CHANNELS, {
		spawnTerminal: ({ options }) => pty.spawn(options),
		writeTerminal: ({ id, data }) => pty.write(id, data),
		resizeTerminal: ({ id, cols, rows }) => pty.resize(id, cols, rows),
		closeTerminal: ({ id }) => pty.close(id),
	});

	pty.onData((id, data) => {
		sendToRenderer(IpcChannels.TerminalData, { id, data } satisfies TerminalDataEvent);
	});
	pty.onExit((id, exitCode, signal) => {
		sendToRenderer(IpcChannels.TerminalExit, { id, exitCode, signal } satisfies TerminalExitEvent);
	});
}
