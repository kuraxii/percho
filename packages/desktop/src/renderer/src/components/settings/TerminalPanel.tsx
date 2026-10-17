import {
	TERMINAL_FONT_SIZE_MAX,
	TERMINAL_FONT_SIZE_MIN,
	TERMINAL_LINE_HEIGHT_MAX,
	TERMINAL_LINE_HEIGHT_MIN,
	TERMINAL_SCROLLBACK_MAX,
	TERMINAL_SCROLLBACK_MIN,
	type TerminalCursorStyle,
	type TerminalGpuAcceleration,
	type TerminalTitleMode,
} from "@percho/shared";
import { type MessageKey, useT } from "../../i18n";
import { useUiPreferencesStore } from "../../stores/ui-preferences";
import { Switch } from "../ui/Switch";

/** 一排设置 chip（枚举型设置共用）：形状/配色沿用主题选择器的按钮 */
function ChipGroup<T extends string>({
	options,
	value,
	onChange,
}: {
	options: readonly { value: T; labelKey: MessageKey }[];
	value: T;
	onChange: (value: T) => void;
}) {
	const t = useT();
	return (
		<div className="mt-2 flex flex-wrap gap-2">
			{options.map((o) => (
				<button
					key={o.value}
					type="button"
					onClick={() => onChange(o.value)}
					aria-pressed={o.value === value}
					className={`rounded-lg border px-3 py-1.5 text-ui-13 transition-colors ${
						o.value === value
							? "border-ink bg-ink text-on-ink"
							: "border-border text-ink-2 hover:border-border-strong hover:bg-hover"
					}`}
				>
					{t(o.labelKey)}
				</button>
			))}
		</div>
	);
}

const CURSOR_STYLES: readonly { value: TerminalCursorStyle; labelKey: MessageKey }[] = [
	{ value: "block" as const, labelKey: "settings.terminal.cursorStyleBlock" },
	{ value: "line" as const, labelKey: "settings.terminal.cursorStyleLine" },
	{ value: "bar" as const, labelKey: "settings.terminal.cursorStyleBar" },
];

const GPU_MODES: readonly { value: TerminalGpuAcceleration; labelKey: MessageKey }[] = [
	{ value: "auto" as const, labelKey: "settings.terminal.gpuAuto" },
	{ value: "on" as const, labelKey: "settings.terminal.gpuOn" },
	{ value: "off" as const, labelKey: "settings.terminal.gpuOff" },
];

const TITLE_MODES: readonly { value: TerminalTitleMode; labelKey: MessageKey }[] = [
	{ value: "auto" as const, labelKey: "settings.terminal.titleModeAuto" },
	{ value: "shell" as const, labelKey: "settings.terminal.titleModeShell" },
	{ value: "cwd" as const, labelKey: "settings.terminal.titleModeCwd" },
];

/** 内建终端设置（9 项核心项）：字号/字体/光标即时热更新，其余项仅新终端生效 */
export function TerminalPanel() {
	const t = useT();
	const fontFamily = useUiPreferencesStore((s) => s.terminalFontFamily);
	const setFontFamily = useUiPreferencesStore((s) => s.setTerminalFontFamily);
	const fontSize = useUiPreferencesStore((s) => s.terminalFontSize);
	const setFontSize = useUiPreferencesStore((s) => s.setTerminalFontSize);
	const lineHeight = useUiPreferencesStore((s) => s.terminalLineHeight);
	const setLineHeight = useUiPreferencesStore((s) => s.setTerminalLineHeight);
	const cursorBlinking = useUiPreferencesStore((s) => s.terminalCursorBlinking);
	const setCursorBlinking = useUiPreferencesStore((s) => s.setTerminalCursorBlinking);
	const cursorStyle = useUiPreferencesStore((s) => s.terminalCursorStyle);
	const setCursorStyle = useUiPreferencesStore((s) => s.setTerminalCursorStyle);
	const scrollback = useUiPreferencesStore((s) => s.terminalScrollback);
	const setScrollback = useUiPreferencesStore((s) => s.setTerminalScrollback);
	const gpuAcceleration = useUiPreferencesStore((s) => s.terminalGpuAcceleration);
	const setGpuAcceleration = useUiPreferencesStore((s) => s.setTerminalGpuAcceleration);
	const titleMode = useUiPreferencesStore((s) => s.terminalTitleMode);
	const setTitleMode = useUiPreferencesStore((s) => s.setTerminalTitleMode);
	const copyOnSelection = useUiPreferencesStore((s) => s.terminalCopyOnSelection);
	const setCopyOnSelection = useUiPreferencesStore((s) => s.setTerminalCopyOnSelection);

	const numberInputClass =
		"w-28 rounded-lg border border-border bg-transparent px-3 py-1.5 text-ui-13 text-ink outline-none transition-colors focus:border-border-strong";

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h3 className="text-ui-13 font-medium text-ink">{t("settings.terminal.fontFamily")}</h3>
				<p className="mt-0.5 text-ui-11 leading-relaxed text-ink-faint">
					{t("settings.terminal.fontFamilyHint")}
				</p>
				<input
					type="text"
					value={fontFamily}
					onChange={(e) => setFontFamily(e.target.value)}
					spellCheck={false}
					className="mt-2 w-full rounded-lg border border-border bg-transparent px-3 py-1.5 font-mono text-ui-13 text-ink outline-none transition-colors focus:border-border-strong"
				/>
			</div>
			<div className="flex items-center justify-between gap-4">
				<div>
					<h3 className="text-ui-13 font-medium text-ink">{t("settings.terminal.fontSize")}</h3>
					<p className="mt-0.5 text-ui-11 leading-relaxed text-ink-faint">
						{t("settings.terminal.fontSizeHint")}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<input
						type="number"
						min={TERMINAL_FONT_SIZE_MIN}
						max={TERMINAL_FONT_SIZE_MAX}
						value={fontSize}
						onChange={(e) => setFontSize(Number(e.target.value))}
						className={numberInputClass}
						aria-label={t("settings.terminal.fontSize")}
					/>
					<span className="text-ui-12 text-ink-dim">px</span>
				</div>
			</div>
			<div className="flex items-center justify-between gap-4">
				<div>
					<h3 className="text-ui-13 font-medium text-ink">{t("settings.terminal.lineHeight")}</h3>
					<p className="mt-0.5 text-ui-11 leading-relaxed text-ink-faint">
						{t("settings.terminal.lineHeightHint")}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<input
						type="number"
						min={TERMINAL_LINE_HEIGHT_MIN}
						max={TERMINAL_LINE_HEIGHT_MAX}
						step={0.1}
						value={lineHeight}
						onChange={(e) => setLineHeight(Number(e.target.value))}
						className={numberInputClass}
						aria-label={t("settings.terminal.lineHeight")}
					/>
				</div>
			</div>
			<div>
				<div className="flex items-center justify-between gap-4">
					<h3 className="text-ui-13 font-medium text-ink">{t("settings.terminal.cursorBlinking")}</h3>
					<Switch checked={cursorBlinking} onCheckedChange={setCursorBlinking} />
				</div>
				<p className="mt-0.5 text-ui-11 leading-relaxed text-ink-faint">
					{t("settings.terminal.cursorBlinkingHint")}
				</p>
			</div>
			<div>
				<h3 className="text-ui-13 font-medium text-ink">{t("settings.terminal.cursorStyle")}</h3>
				<p className="mt-0.5 text-ui-11 leading-relaxed text-ink-faint">
					{t("settings.terminal.cursorStyleHint")}
				</p>
				<ChipGroup<TerminalCursorStyle>
					options={CURSOR_STYLES}
					value={cursorStyle}
					onChange={setCursorStyle}
				/>
			</div>
			<div className="flex items-center justify-between gap-4">
				<div>
					<h3 className="text-ui-13 font-medium text-ink">{t("settings.terminal.scrollback")}</h3>
					<p className="mt-0.5 text-ui-11 leading-relaxed text-ink-faint">
						{t("settings.terminal.scrollbackHint")}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<input
						type="number"
						min={TERMINAL_SCROLLBACK_MIN}
						max={TERMINAL_SCROLLBACK_MAX}
						step={100}
						value={scrollback}
						onChange={(e) => setScrollback(Number(e.target.value))}
						className={numberInputClass}
						aria-label={t("settings.terminal.scrollback")}
					/>
				</div>
			</div>
			<div>
				<h3 className="text-ui-13 font-medium text-ink">{t("settings.terminal.gpuAcceleration")}</h3>
				<p className="mt-0.5 text-ui-11 leading-relaxed text-ink-faint">
					{t("settings.terminal.gpuAccelerationHint")}
				</p>
				<ChipGroup<TerminalGpuAcceleration>
					options={GPU_MODES}
					value={gpuAcceleration}
					onChange={setGpuAcceleration}
				/>
			</div>
			<div>
				<h3 className="text-ui-13 font-medium text-ink">{t("settings.terminal.titleMode")}</h3>
				<p className="mt-0.5 text-ui-11 leading-relaxed text-ink-faint">
					{t("settings.terminal.titleModeHint")}
				</p>
				<ChipGroup<TerminalTitleMode> options={TITLE_MODES} value={titleMode} onChange={setTitleMode} />
			</div>
			<div>
				<div className="flex items-center justify-between gap-4">
					<h3 className="text-ui-13 font-medium text-ink">{t("settings.terminal.copyOnSelection")}</h3>
					<Switch checked={copyOnSelection} onCheckedChange={setCopyOnSelection} />
				</div>
				<p className="mt-0.5 text-ui-11 leading-relaxed text-ink-faint">
					{t("settings.terminal.copyOnSelectionHint")}
				</p>
			</div>
		</div>
	);
}
