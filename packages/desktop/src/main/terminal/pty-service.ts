import { join } from "node:path";
import type { TerminalSpawnOptions } from "@percho/shared";
import { type UtilityProcess, utilityProcess } from "electron";

/**
 * 内建终端后端（D5 边界）：main 进程直用 node-pty → **v2：utilityProcess 隔离**。
 *
 * node-pty 原生模块在独立 pty-host-child 子进程加载（vscode ptyHost 模型：崩溃隔离 +
 * 权限最小化）；本服务是纯代理：分配 id → MessagePort 收发 → 事件广播给 ipc 桥。
 * renderer 只经 IPtyHost 接口与 IPC 通道交互，接口签名对 renderer 不变（spawn 异步化
 * 只因回执跨进程，TerminalView 本来 await）。
 *
 * 协议（pty-host-child.js 对端）：
 *   父→子：{ type:"spawn", id, options } / { type:"write", id, data } /
 *          { type:"resize", id, cols, rows } / { type:"close", id } / { type:"dispose" }
 *   子→父：{ type:"spawn-result", id, pid, shell } / { type:"spawn-error", id, message } /
 *          { type:"data", id, data } / { type:"exit", id, exitCode, signal }
 */

/** 主机事件订阅：返回取消订阅函数（单例多订阅者，ipc handler 只注册一次） */
export type PtyDataHandler = (id: number, data: string) => void;
export type PtyExitHandler = (id: number, exitCode: number, signal?: number) => void;

/** 主机接口：spawn（异步回执，跨进程）/write/resize/close + 事件订阅 */
export interface IPtyHost {
	spawn(options?: TerminalSpawnOptions): Promise<{ id: number; pid: number; shell: string }>;
	write(id: number, data: string): void;
	resize(id: number, cols: number, rows: number): void;
	close(id: number): void;
	onData(handler: PtyDataHandler): () => void;
	onExit(handler: PtyExitHandler): () => void;
	dispose(): void;
}

interface ChildMessage {
	type: "spawn-result" | "spawn-error" | "data" | "exit";
	id: number;
	pid?: number;
	shell?: string;
	message?: string;
	data?: string;
	exitCode?: number;
	signal?: number;
}

/**
 * 输出批处理（移植 vscode src/vs/platform/terminal/common/terminalDataBuffering.ts）：
 * 首个数据到达时起 throttleBy 定时器，窗口内后续数据 push 聚合，flush 时 join 成一条
 * 批量推送——cat 大文件时 node-pty 每 4KB 触发一次 onData，5ms 窗口合多次为一次 IPC。
 */
class TerminalDataBufferer {
	private readonly buffers = new Map<number, { data: string[]; timer: NodeJS.Timeout }>();

	constructor(
		private readonly throttleBy: number,
		private readonly flush: (id: number, data: string) => void,
	) {}

	push(id: number, data: string): void {
		const existing = this.buffers.get(id);
		if (existing) {
			existing.data.push(data);
			return;
		}
		const timer = setTimeout(() => this.flushNow(id), this.throttleBy);
		this.buffers.set(id, { data: [data], timer });
	}

	/** 立即排空某实例剩余缓冲（close 前调用，避免窗口内尾部输出丢失） */
	flushNow(id: number): void {
		const entry = this.buffers.get(id);
		if (!entry) return;
		this.buffers.delete(id);
		clearTimeout(entry.timer);
		this.flush(id, entry.data.join(""));
	}

	dispose(): void {
		for (const id of [...this.buffers.keys()]) this.flushNow(id);
	}
}

const SPAWN_TIMEOUT_MS = 10_000;

/** PtyService：pty 宿主子进程代理（index.ts 装配单例，ipc/terminal.ts 桥接事件） */
export class PtyService implements IPtyHost {
	private child: UtilityProcess | null = null;
	/** 等待 spawn 回执的请求（回执到达或超时移除） */
	private readonly pendingSpawns = new Map<
		number,
		{
			resolve: (h: { id: number; pid: number; shell: string }) => void;
			reject: (e: Error) => void;
			timer: NodeJS.Timeout;
		}
	>();
	/** 已成功 spawn 且未退出（崩溃清场用） */
	private readonly live = new Set<number>();
	private readonly dataHandlers = new Set<PtyDataHandler>();
	private readonly exitHandlers = new Set<PtyExitHandler>();
	private readonly bufferer = new TerminalDataBufferer(5, (id, data) => {
		for (const handler of this.dataHandlers) handler(id, data);
	});
	private nextId = 1;

	onData(handler: PtyDataHandler): () => void {
		this.dataHandlers.add(handler);
		return () => this.dataHandlers.delete(handler);
	}

	onExit(handler: PtyExitHandler): () => void {
		this.exitHandlers.add(handler);
		return () => this.exitHandlers.delete(handler);
	}

	async spawn(options?: TerminalSpawnOptions): Promise<{ id: number; pid: number; shell: string }> {
		const id = this.nextId++;
		const child = this.ensureChild();
		return new Promise<{ id: number; pid: number; shell: string }>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pendingSpawns.delete(id);
				reject(new Error(`pty spawn 超时（${SPAWN_TIMEOUT_MS}ms 无回执）`));
			}, SPAWN_TIMEOUT_MS);
			this.pendingSpawns.set(id, { resolve, reject, timer });
			child.postMessage({ type: "spawn", id, options });
		});
	}

	write(id: number, data: string): void {
		this.child?.postMessage({ type: "write", id, data });
	}

	resize(id: number, cols: number, rows: number): void {
		this.child?.postMessage({ type: "resize", id, cols, rows });
	}

	close(id: number): void {
		// 尾部输出立即发（不等 5ms 窗口）；kill 由子进程完成，exit 回执到达时清 live
		this.bufferer.flushNow(id);
		this.child?.postMessage({ type: "close", id });
	}

	/** 应用退出时清场：全部 close + 子进程退出 + 剩余缓冲排空 */
	dispose(): void {
		for (const id of [...this.live]) this.child?.postMessage({ type: "close", id });
		this.child?.kill();
		this.child = null;
		this.bufferer.dispose();
		this.live.clear();
	}

	/** 懒启动子进程：首次 spawn 时 fork，崩溃/退出后下次 spawn 自动重建（自愈） */
	private ensureChild(): UtilityProcess {
		if (this.child) return this.child;
		const child = utilityProcess.fork(join(__dirname, "pty-host-child.js"), [], {
			serviceName: "pty-host",
		});
		child.on("message", (msg: ChildMessage) => this.onChildMessage(msg));
		child.on("exit", () => {
			// 子进程退出（含崩溃）：所有活跃实例视为退出，清状态；下次 spawn 自愈重建
			for (const id of [...this.live]) {
				this.live.delete(id);
				this.bufferer.flushNow(id);
				for (const handler of this.exitHandlers) handler(id, 1);
			}
			this.child = null;
		});
		this.child = child;
		return child;
	}

	private onChildMessage(msg: ChildMessage | undefined): void {
		// 防御：非法/未知消息静默忽略（协议演进或异常打包都不再崩主进程）
		if (!msg || typeof msg.type !== "string") return;
		switch (msg.type) {
			case "spawn-result": {
				const pending = this.pendingSpawns.get(msg.id);
				if (!pending) return;
				this.pendingSpawns.delete(msg.id);
				clearTimeout(pending.timer);
				this.live.add(msg.id);
				pending.resolve({ id: msg.id, pid: msg.pid ?? -1, shell: msg.shell ?? "/bin/sh" });
				break;
			}
			case "spawn-error": {
				const pending = this.pendingSpawns.get(msg.id);
				if (!pending) return;
				this.pendingSpawns.delete(msg.id);
				clearTimeout(pending.timer);
				pending.reject(new Error(msg.message ?? "pty spawn 失败"));
				break;
			}
			case "data": {
				this.bufferer.push(msg.id, msg.data ?? "");
				break;
			}
			case "exit": {
				this.live.delete(msg.id);
				this.bufferer.flushNow(msg.id);
				for (const handler of this.exitHandlers) handler(msg.id, msg.exitCode ?? 1, msg.signal);
				break;
			}
		}
	}
}
