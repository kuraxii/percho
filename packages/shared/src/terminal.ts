/**
 * 内建终端面板高度契约（单一事实源）：main 的 `ui-state.ts` 归一化与 renderer 的拖拽共用同一组上下界。
 * 纯常量 + 纯函数（不 import electron / React），main 与 renderer 都能直接拿。
 */

/** 终端面板默认高度（px，= 16rem）：没拖过的用户看到的高度；也是脏值回落的兜底值 */
export const TERMINAL_DEFAULT_HEIGHT = 288;

/** 用户可拖范围（`UiState.terminalHeight` 落盘前按此夹紧，renderer 的拖拽也在这一步夹住） */
export const TERMINAL_MIN_HEIGHT = 120;
export const TERMINAL_MAX_HEIGHT = 640;

/** 把「用户意图高度」夹进 `[TERMINAL_MIN_HEIGHT, TERMINAL_MAX_HEIGHT]` 并取整。
 *  非有限数（脏文件里的字符串/null/数组、未来改上下界后的越界值）一律回落默认高度。 */
export function clampTerminalHeight(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return TERMINAL_DEFAULT_HEIGHT;
	return Math.round(Math.min(TERMINAL_MAX_HEIGHT, Math.max(TERMINAL_MIN_HEIGHT, value)));
}

/**
 * 终端设置默认值与校验（设置 → 终端面板，ui-state 持久化）。
 * 对齐 vscode terminal.integrated.* 默认（fontSize 14 / lineHeight 1.1 / cursorBlinking true / cursorStyle block），
 * 但 scrollback 默认 2000（vscode 1000，用户指定）。
 */

/** 默认终端字体族（现状实现值：JetBrains Mono 优先的等宽栈，含 CJK 兜底） */
export const TERMINAL_FONT_FAMILY_DEFAULT =
	'"JetBrains Mono", "Cascadia Code", "Fira Code", Menlo, Consolas, "Noto Sans Mono CJK SC", monospace';
/** 终端字号（px），对齐 vscode Linux/Windows 默认 14（mac 12 不采用） */
export const TERMINAL_FONT_SIZE_DEFAULT = 14;
export const TERMINAL_FONT_SIZE_MIN = 6;
export const TERMINAL_FONT_SIZE_MAX = 100;
/** 行高乘数，对齐 vscode Linux 默认 1.1 */
export const TERMINAL_LINE_HEIGHT_DEFAULT = 1.1;
export const TERMINAL_LINE_HEIGHT_MIN = 0.8;
export const TERMINAL_LINE_HEIGHT_MAX = 2;
/** 光标闪烁（xterm cursorBlinking） */
export const TERMINAL_CURSOR_BLINKING_DEFAULT = true;
/** 光标样式（xterm cursorStyle，与 vscode cursorStyle 同枚举） */
export type TerminalCursorStyle = "block" | "line" | "bar";
export const TERMINAL_CURSOR_STYLE_DEFAULT: TerminalCursorStyle = "block";
/** 滚动回退行数（用户指定 2000，vscode 默认 1000） */
export const TERMINAL_SCROLLBACK_DEFAULT = 2000;
export const TERMINAL_SCROLLBACK_MIN = 100;
export const TERMINAL_SCROLLBACK_MAX = 100000;
/** WebGL 渲染（vscode gpuAcceleration auto/on/off） */
export type TerminalGpuAcceleration = "auto" | "on" | "off";
export const TERMINAL_GPU_ACCELERATION_DEFAULT: TerminalGpuAcceleration = "auto";
/** 标题模式：auto = shell 名起步、OSC 0/2/7/9;9/1337 更新（现状）；shell = 固定 shell 名；cwd = 固定启动 cwd 名 */
export type TerminalTitleMode = "auto" | "shell" | "cwd";
export const TERMINAL_TITLE_MODE_DEFAULT: TerminalTitleMode = "auto";
/** 选中即复制（vscode copyOnSelection，默认关） */
export const TERMINAL_COPY_ON_SELECTION_DEFAULT = false;

/** 字号夹紧：非有限数/越界回落默认 14 */
export function clampTerminalFontSize(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return TERMINAL_FONT_SIZE_DEFAULT;
	return Math.round(Math.min(TERMINAL_FONT_SIZE_MAX, Math.max(TERMINAL_FONT_SIZE_MIN, value)));
}

/** 行高夹紧：非有限数/越界回落默认 1.1（保留两位小数） */
export function clampTerminalLineHeight(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return TERMINAL_LINE_HEIGHT_DEFAULT;
	const clamped = Math.min(TERMINAL_LINE_HEIGHT_MAX, Math.max(TERMINAL_LINE_HEIGHT_MIN, value));
	return Math.round(clamped * 100) / 100;
}

/** 滚动回退夹紧：非有限数/越界回落默认 2000（取整） */
export function clampTerminalScrollback(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return TERMINAL_SCROLLBACK_DEFAULT;
	return Math.round(Math.min(TERMINAL_SCROLLBACK_MAX, Math.max(TERMINAL_SCROLLBACK_MIN, value)));
}

/** 字体族校验：非字符串/空串回落默认 */
export function sanitizeTerminalFontFamily(value: unknown): string {
	if (typeof value !== "string" || value.trim() === "") return TERMINAL_FONT_FAMILY_DEFAULT;
	return value;
}

/** 枚举校验：不在白名单回落默认 */
export function sanitizeTerminalCursorStyle(value: unknown): TerminalCursorStyle {
	return value === "line" || value === "bar" ? value : TERMINAL_CURSOR_STYLE_DEFAULT;
}

export function sanitizeTerminalGpuAcceleration(value: unknown): TerminalGpuAcceleration {
	return value === "on" || value === "off" ? value : TERMINAL_GPU_ACCELERATION_DEFAULT;
}

export function sanitizeTerminalTitleMode(value: unknown): TerminalTitleMode {
	return value === "shell" || value === "cwd" ? value : TERMINAL_TITLE_MODE_DEFAULT;
}

export function sanitizeTerminalCopyOnSelection(value: unknown): boolean {
	return value === true;
}
