import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";
import { getPi } from "../../api";
import { selectActiveCwd } from "../../lib/active-cwd";
import { useSessionsStore } from "../../stores/sessions";
import { useTerminalStore } from "../../stores/terminal";
import { useThemeStore } from "../../stores/theme";
import { useUiPreferencesStore } from "../../stores/ui-preferences";

/** vscode cursorStyle 枚举（block/line/bar）→ xterm cursorStyle（block/underline/bar）映射 */
const XTERM_CURSOR_STYLE = { block: "block", line: "underline", bar: "bar" } as const;

/** xterm 主题（随 Percho 主题切换重建实例；深/浅两套近似 vscode 配色） */
const XTERM_THEMES = {
	dark: {
		background: "#1e1e1e",
		foreground: "#d4d4d4",
		cursor: "#aeafad",
		cursorAccent: "#1e1e1e",
		selectionBackground: "#264f78",
	},
	light: {
		background: "#ffffff",
		foreground: "#333333",
		cursor: "#000000",
		cursorAccent: "#ffffff",
		selectionBackground: "#add6ff",
	},
} as const;

/** 终端视图句柄：供父级（分屏区）点击时透传焦点到对应 xterm 实例 */
export interface TerminalViewHandle {
	focus: () => void;
}

/**
 * 单个 tab 的终端视图（多 tab 并存：每 tab 一个组件实例，xterm buffer 各自保留；
 * 非活动 tab / 非激活 group 由 TerminalDock 用 visibility 隐藏而非卸载，切回不重 spawn、不丢输出）。
 *
 * 生命周期全在组件内：挂载时 spawn（cwd 取挂载时刻的活跃会话工作目录）+ 订阅 pty 事件，
 * 卸载时 close 对应 pty + dispose xterm。
 */
export function TerminalView({
	tabId,
	onHandle,
}: {
	tabId: number;
	/** 焦点句柄注册（卸载时回调 null）；用于分屏点击的焦点透传 */
	onHandle?: (handle: TerminalViewHandle | null) => void;
}): React.JSX.Element {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const handleRef = useRef<{ id: number; pid: number } | null>(null);
	const terminalRef = useRef<Terminal | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const theme = useThemeStore((state) => state.resolved);
	// 终端设置（设置 → 终端面板）：单字段 selector 保证引用稳定；字体/光标即时热更新，
	// scrollback/gpu/标题/复制仅新终端生效（xterm 不重建已有 buffer）
	const fontFamily = useUiPreferencesStore((s) => s.terminalFontFamily);
	const fontSize = useUiPreferencesStore((s) => s.terminalFontSize);
	const lineHeight = useUiPreferencesStore((s) => s.terminalLineHeight);
	const cursorBlinking = useUiPreferencesStore((s) => s.terminalCursorBlinking);
	const cursorStyle = useUiPreferencesStore((s) => s.terminalCursorStyle);
	const scrollback = useUiPreferencesStore((s) => s.terminalScrollback);
	const gpuAcceleration = useUiPreferencesStore((s) => s.terminalGpuAcceleration);
	const titleMode = useUiPreferencesStore((s) => s.terminalTitleMode);
	const copyOnSelection = useUiPreferencesStore((s) => s.terminalCopyOnSelection);

	// biome-ignore lint/correctness/useExhaustiveDependencies: onHandle 是宿主注册回调，每次 render 新引用，进 deps 会让 effect 反复重建重新 spawn 终端；焦点句柄只需 mount/卸载登记一次
	useEffect(() => {
		const pi = getPi();
		const container = containerRef.current;
		if (!container) return;

		// cwd 取当前活跃会话工作目录（无会话则日常空间/项目缺省），与 Percho 会话概念一致
		const cwd = selectActiveCwd(useSessionsStore.getState()) ?? undefined;

		const terminal = new Terminal({
			convertEol: false,
			cursorBlink: cursorBlinking,
			cursorStyle: XTERM_CURSOR_STYLE[cursorStyle],
			fontFamily,
			fontSize,
			lineHeight,
			scrollback,
			theme: XTERM_THEMES[theme],
		});

		const fitAddon = new FitAddon();
		terminal.loadAddon(fitAddon);
		fitAddonRef.current = fitAddon;

		// GPU 渲染：off 不加载（回退 canvas）；auto/on 尝试 WebGL，失败/context 丢失回退默认 canvas 渲染器
		if (gpuAcceleration !== "off") {
			try {
				const webglAddon = new WebglAddon();
				webglAddon.onContextLoss(() => webglAddon.dispose());
				terminal.loadAddon(webglAddon);
			} catch {
				// 回退 canvas 渲染器（默认），无需额外处理
			}
		}

		terminal.open(container);
		terminalRef.current = terminal;
		onHandle?.({ focus: () => terminal.focus() });
		const initialCols = terminal.cols;
		const initialRows = terminal.rows;

		// 标题：auto = shell 名起步 + OSC 0/2/7/9;9/1337 更新（现状）；shell = 固定 shell 名；cwd = 固定启动 cwd 名
		const applyProtocolTitle = (title: string) => {
			if (!title || titleMode !== "auto") return;
			useTerminalStore.getState().setTabTitle(tabId, title);
		};
		const setInitialTitle = (title: string) => {
			if (title) useTerminalStore.getState().setTabTitle(tabId, title);
		};
		// shell 显式设置标题（OSC 0/2，如 precmd 里 echo 标题）优先于 cwd 名
		const unsubTitle = terminal.onTitleChange((title) => applyProtocolTitle(title));

		// shell 协议（复刻 vscode shellIntegrationAddon 的 cwd 解析）：
		//   OSC 7 ; file://cwd          —— 主流（zsh precmd/oh-my-zsh 默认发）
		//   OSC 9 ; 9 ; cwd             —— ConEmu/Windows 协议
		//   OSC 1337 ; CurrentDir=cwd   —— iTerm 协议
		const setCwdTitle = (cwd: string) => {
			const name = cwd.split(/[\\/]/).filter(Boolean).pop();
			if (name) applyProtocolTitle(name);
		};
		const unsubOsc7 = terminal.parser.registerOscHandler(7, (data) => {
			if (data.startsWith("file://")) {
				try {
					setCwdTitle(decodeURIComponent(data.slice(7).split(/[?#]/)[0] ?? ""));
				} catch {
					// 非法 percent 编码直接丢弃
				}
			}
			return true;
		});
		const unsubOsc9 = terminal.parser.registerOscHandler(9, (data) => {
			const [first, second] = data.split(";");
			// cwd：9 ; 9 ; <cwd>（ConEmu 协议）
			if (first === "9" && second) {
				setCwdTitle(second);
			}
			return true;
		});
		const unsubOsc1337 = terminal.parser.registerOscHandler(1337, (data) => {
			const eq = data.indexOf("=");
			if (eq >= 0 && data.slice(0, eq) === "CurrentDir") setCwdTitle(data.slice(eq + 1));
			return true;
		});

		// 输入与尺寸：spawn 完成前回调已注册（handleRef 兜底，异步返回后自动生效）
		terminal.onData((data) => {
			const handle = handleRef.current;
			if (handle) void pi.writeTerminal({ id: handle.id, data });
		});
		terminal.onResize(({ cols, rows }) => {
			const handle = handleRef.current;
			if (handle) void pi.resizeTerminal({ id: handle.id, cols, rows });
		});

		// 容器尺寸变化（面板拖拽/窗口缩放）→ fit + 同步尺寸
		const observer = new ResizeObserver(() => {
			if (handleRef.current) {
				try {
					fitAddon.fit();
				} catch {
					// 容器 0 尺寸时的 fit 会抛，忽略（下次 resize 再来）
				}
			}
		});
		observer.observe(container);

		// pty 输出/退出订阅（多 tab：以 handleRef 的 pty id 区分归属）
		const unsubData = pi.onTerminalData(({ id, data }) => {
			if (id === handleRef.current?.id) terminal.write(data);
		});
		const unsubExit = pi.onTerminalExit(({ id, exitCode }) => {
			if (id !== handleRef.current?.id) return;
			handleRef.current = null;
			useTerminalStore.getState().markTabExited(tabId);
			terminal.write(`\r\n\x1b[90m[进程已退出，exit code ${exitCode}]\x1b[0m\r\n`);
		});

		void pi
			.spawnTerminal({
				options: {
					cwd,
					cols: initialCols,
					rows: initialRows,
				},
			})
			.then((handle) => {
				handleRef.current = handle;
				useTerminalStore.getState().setTabHandle(tabId, handle);
				// 默认标题：cwd 模式 = 启动 cwd 名，其余 = shell 名；auto 下 OSC 0/2 与 OSC 7 到达后覆盖
				if (titleMode === "cwd") {
					if (cwd) setInitialTitle(cwd.split(/[\\/]/).filter(Boolean).pop() ?? "");
				} else {
					const shellName = handle.shell.split(/[\\/]/).filter(Boolean).pop();
					if (shellName) setInitialTitle(shellName);
				}
				// spawn 后立即同步一次尺寸（fit 后 xterm 尺寸可能与初值不同）
				fitAddon.fit();
				void pi.resizeTerminal({ id: handle.id, cols: terminal.cols, rows: terminal.rows });
			})
			.catch((error: unknown) => {
				useTerminalStore.getState().markTabExited(tabId);
				terminal.write(`\r\n\x1b[90m[终端启动失败] ${String(error)}\x1b[0m\r\n`);
			});

		return () => {
			observer.disconnect();
			unsubData();
			unsubExit();
			unsubTitle.dispose();
			unsubOsc7.dispose();
			unsubOsc9.dispose();
			unsubOsc1337.dispose();
			const handle = handleRef.current;
			handleRef.current = null;
			if (handle) void pi.closeTerminal({ id: handle.id });
			terminalRef.current = null;
			fitAddonRef.current = null;
			onHandle?.(null);
			terminal.dispose();
		};
	}, [tabId, theme]);

	// 字体/光标即时热更新（改设置立刻生效；scrollback 等其余项仅新终端生效）
	useEffect(() => {
		const terminal = terminalRef.current;
		if (!terminal) return;
		terminal.options.fontFamily = fontFamily;
		terminal.options.fontSize = fontSize;
		terminal.options.lineHeight = lineHeight;
		terminal.options.cursorBlink = cursorBlinking;
		terminal.options.cursorStyle = XTERM_CURSOR_STYLE[cursorStyle];
		try {
			fitAddonRef.current?.fit();
		} catch {
			// 容器 0 尺寸时的 fit 会抛，忽略（下次 resize 再来）
		}
	}, [fontFamily, fontSize, lineHeight, cursorBlinking, cursorStyle]);

	// 选中即复制（copyOnSelection）：注册/注销跟随设置变化
	useEffect(() => {
		const terminal = terminalRef.current;
		if (!terminal || !copyOnSelection) return;
		const unsub = terminal.onSelectionChange(() => {
			const selection = terminal.getSelection();
			if (selection) void navigator.clipboard.writeText(selection).catch(() => {});
		});
		return () => unsub.dispose();
	}, [copyOnSelection]);

	return <div ref={containerRef} className="h-full w-full" />;
}
