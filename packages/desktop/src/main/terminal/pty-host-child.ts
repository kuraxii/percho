import { type IPty, spawn as ptySpawn } from "node-pty";

/**
 * pty 宿主子进程（utilityProcess 隔离，vscode ptyHost 模型）：
 * node-pty 原生模块只在本进程加载——崩溃/泄漏/恶意输出被隔离在宿主之外，
 * Electron main 进程不再直接持有任何原生 pty 模块。
 *
 * 通信：父进程 `utilityProcess.fork` 本文件（electron-vite main 多入口输出 pty-host-child.js），
 * 经 MessagePortMain（`process.parentPort`）收发消息。协议见 pty-service.ts 顶部注释。
 *
 * 本文件不 import electron API（只依赖 process.parentPort 与 node-pty），可独立演进。
 */

interface SpawnOptions {
	cwd?: string;
	shell?: string;
	cols?: number;
	rows?: number;
}

interface HostMessage {
	type: "spawn" | "write" | "resize" | "close" | "dispose";
	id: number;
	options?: SpawnOptions;
	data?: string;
	cols?: number;
	rows?: number;
}

/** id → pty 实例（id 由父进程分配，保证多宿主/重启场景下不撞号） */
const pties = new Map<number, { pty: IPty; exited: boolean }>();

function post(message: unknown): void {
	process.parentPort?.postMessage(message);
}

function defaultShell(): string {
	return process.env.SHELL || "/bin/bash";
}

function spawnPty(id: number, options?: SpawnOptions): void {
	try {
		const shell = options?.shell || defaultShell();
		const pty = ptySpawn(shell, [], {
			name: "xterm-256color",
			cols: options?.cols ?? 80,
			rows: options?.rows ?? 24,
			cwd: options?.cwd || process.env.HOME || "/",
			env: process.env,
		});
		const entry = { pty, exited: false };
		pties.set(id, entry);
		pty.onData((data) => post({ type: "data", id, data }));
		pty.onExit(({ exitCode, signal }) => {
			pties.delete(id);
			post({ type: "exit", id, exitCode, signal });
		});
		post({ type: "spawn-result", id, pid: pty.pid, shell });
	} catch (error) {
		post({ type: "spawn-error", id, message: String(error) });
	}
}

process.parentPort?.on("message", (event: { data: HostMessage }) => {
	const msg = event.data;
	switch (msg.type) {
		case "spawn": {
			spawnPty(msg.id, msg.options);
			break;
		}
		case "write": {
			const entry = pties.get(msg.id);
			if (!entry || entry.exited) break;
			try {
				entry.pty.write(msg.data ?? "");
			} catch {
				// 进程已退出后的写入是合法竞态（onExit 已发出），忽略
			}
			break;
		}
		case "resize": {
			const entry = pties.get(msg.id);
			if (!entry || entry.exited) break;
			try {
				entry.pty.resize(msg.cols ?? 80, msg.rows ?? 24);
			} catch {
				// resize 竞态同写：进程已死时忽略
			}
			break;
		}
		case "close": {
			const entry = pties.get(msg.id);
			if (!entry || entry.exited) break;
			try {
				entry.pty.kill();
			} catch {
				// kill 已退出的 pty 会抛（exited flag 已挡，双保险忽略）
			}
			break;
		}
		case "dispose": {
			for (const { pty } of pties.values()) {
				try {
					pty.kill();
				} catch {
					// 清场尽力而为
				}
			}
			pties.clear();
			process.exit(0);
			break;
		}
	}
});
