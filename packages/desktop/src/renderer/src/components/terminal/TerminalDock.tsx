import { Fragment, type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import { useT } from "../../i18n";
import {
	activePaneOf,
	collectTabs,
	type TerminalNode,
	type TerminalPane,
	useTerminalStore,
} from "../../stores/terminal";
import { useUiPreferencesStore } from "../../stores/ui-preferences";
import {
	ChevronDownIcon,
	MaximizeIcon,
	PlusIcon,
	RestoreIcon,
	SplitIcon,
	TerminalIcon,
	TrashIcon,
} from "../icons";
import { TerminalView, type TerminalViewHandle } from "./TerminalView";

const activateOnKey = (event: KeyboardEvent, activate: () => void) => {
	if (event.key === "Enter" || event.key === " ") {
		event.preventDefault();
		activate();
	}
};

/**
 * 单 pane：内容区（多 tab 叠放，非活动 visibility 隐藏；tab 管理统一在右侧列表）。
 * 焦点透传：点击分屏区域 → 激活该 group + pane，并 focus 对应 xterm 实例
 * （避坑点：键盘输入立即传导至目标子进程，不依赖浏览器焦点默认行为）。
 */
function PaneView({
	pane,
	groupId,
	focusHandles,
}: {
	pane: TerminalPane;
	groupId: number;
	focusHandles: React.MutableRefObject<Map<number, TerminalViewHandle>>;
}): React.JSX.Element {
	return (
		<div
			className="relative h-full min-h-0 min-w-0 flex-1"
			onPointerDownCapture={() => {
				useTerminalStore.getState().activatePane(groupId, pane.id);
				// 捕获阶段先行 focus：xterm 内部 mousedown/selection 处理不抢焦点，
				// 且捕获阶段保证即使子元素 stopPropagation 也能收到点击；本帧 + 下一帧双兜底
				const focusTab = () => focusHandles.current.get(pane.activeTabId ?? -1)?.focus();
				focusTab();
				requestAnimationFrame(focusTab);
			}}
		>
			{pane.tabs.map((tab) => (
				<div
					key={tab.id}
					className={
						tab.id === pane.activeTabId
							? "absolute inset-0"
							: "absolute inset-0 invisible pointer-events-none"
					}
				>
					<TerminalView
						tabId={tab.id}
						onHandle={(handle) => {
							if (handle) focusHandles.current.set(tab.id, handle);
							else focusHandles.current.delete(tab.id);
						}}
					/>
				</div>
			))}
		</div>
	);
}

/** 递归 split 树：row = 左右并排（divider 竖线），col = 上下并排（divider 横线）。
 * divider 支持拖拽调整相邻 pane 比例（对齐 vscode SplitView sash：
 * onSashChange 里 delta = current - start → resize(index, delta)，clamp 到 minimumSize=80px），
 * 双击恢复等分（对齐 onDidSashReset → distributeViewSizes），键盘 ←/→（row）↑/↓（col）微调。 */
function TerminalSplitView({
	node,
	groupId,
	focusHandles,
}: {
	node: TerminalNode;
	groupId: number;
	focusHandles: React.MutableRefObject<Map<number, TerminalViewHandle>>;
}): React.JSX.Element {
	const containerRef = useRef<HTMLDivElement>(null);
	const setSplitRatios = useTerminalStore((s) => s.setSplitRatios);
	const dragRef = useRef<{
		index: number;
		start: number;
		old: number[];
		row: boolean;
		total: number;
	} | null>(null);
	if (node.kind === "pane") return <PaneView pane={node} groupId={groupId} focusHandles={focusHandles} />;
	const row = node.direction === "row";
	const panePx = (): { px: number[]; total: number } => {
		const container = containerRef.current;
		const total = row ? (container?.clientWidth ?? 0) : (container?.clientHeight ?? 0);
		if (!container || total <= 0) return { px: [], total: 0 };
		const panes = Array.from(container.children).filter(
			(el): el is HTMLElement => el instanceof HTMLElement && el.dataset.terminalPane === "true",
		);
		const px = panes.map((el) =>
			row ? el.getBoundingClientRect().width : el.getBoundingClientRect().height,
		);
		return { px, total };
	};
	/** 相邻两 pane 按 delta 比例重分配（其他 pane 不动），clamp 最小 80px（vscode SplitPaneMinSize） */
	const applyDelta = (index: number, delta: number, old: number[], total: number): number[] | null => {
		// divider 位于 pane[index-1] 与 pane[index] 之间（渲染在 child[index] 之前）
		if (index < 1 || index >= old.length || total <= 0) return null;
		const minRatio = Math.min(0.5, 80 / total);
		const a = old[index - 1] ?? 0;
		const b = old[index] ?? 0;
		const sum = a + b;
		const left = Math.max(minRatio, Math.min(sum - minRatio, a + delta / total));
		const ratios = [...old];
		ratios[index - 1] = left;
		ratios[index] = sum - left;
		return ratios;
	};
	const startDrag = (e: React.PointerEvent<HTMLDivElement>, index: number): void => {
		e.preventDefault();
		const { px, total } = panePx();
		if (px.length !== node.children.length || total <= 0) return;
		e.currentTarget.setPointerCapture(e.pointerId);
		dragRef.current = {
			index,
			start: row ? e.clientX : e.clientY,
			old: px.map((p) => p / total),
			row,
			total,
		};
	};
	const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
		const d = dragRef.current;
		if (!d) return;
		const current = d.row ? e.clientX : e.clientY;
		const ratios = applyDelta(d.index, current - d.start, d.old, d.total);
		if (ratios) setSplitRatios(node.id, ratios);
	};
	const endDrag = (): void => {
		dragRef.current = null;
	};
	const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, index: number): void => {
		const step = row
			? e.key === "ArrowLeft"
				? -1
				: e.key === "ArrowRight"
					? 1
					: 0
			: e.key === "ArrowUp"
				? -1
				: e.key === "ArrowDown"
					? 1
					: 0;
		if (step === 0) return;
		e.preventDefault();
		const { px, total } = panePx();
		if (px.length !== node.children.length || total <= 0) return;
		const old = px.map((p) => p / total);
		const ratios = applyDelta(index, (step * 10) / total, old, total);
		if (ratios) setSplitRatios(node.id, ratios);
	};
	return (
		<div ref={containerRef} className={`flex h-full min-h-0 w-full ${row ? "flex-row" : "flex-col"}`}>
			{node.children.map((child, index) => (
				<Fragment key={child.id}>
					{index > 0 && (
						<div className={`relative z-10 flex shrink-0 items-center justify-center ${row ? "w-2" : "h-2"}`}>
							<hr
								tabIndex={0}
								aria-orientation={row ? "vertical" : "horizontal"}
								className={`absolute inset-0 h-full m-0 shrink-0 border-none bg-transparent ${
									row ? "cursor-col-resize" : "cursor-row-resize"
								} hover:bg-border`}
								style={{ cursor: row ? "col-resize" : "row-resize" }}
								onPointerDown={(e) => startDrag(e, index)}
								onPointerMove={onPointerMove}
								onPointerUp={endDrag}
								onPointerCancel={endDrag}
								onDoubleClick={() => setSplitRatios(node.id, undefined)}
								onKeyDown={(e) => onKeyDown(e, index)}
							/>
							<div
								aria-hidden="true"
								className={`pointer-events-none m-0 shrink-0 bg-border ${row ? "h-full w-px" : "h-px w-full"}`}
							/>
						</div>
					)}
					<div
						data-terminal-pane="true"
						className="min-h-0 min-w-0 flex-1"
						style={node.ratios ? { flexGrow: node.ratios[index] ?? 1, flexBasis: 0 } : undefined}
					>
						<TerminalSplitView node={child} groupId={groupId} focusHandles={focusHandles} />
					</div>
				</Fragment>
			))}
		</div>
	);
}

/**
 * 右侧竖排 tab 列表（vscode terminal.integrated.tabs.location: 'right' 语义）：
 * 按 group 分组（组间分隔线），同组多实例加 ┌/├/└ 前缀连线；条目 active 左竖条高亮，
 * hover 只有「分屏 / 关闭」两个动作，中键关闭，launching 转圈。
 */
function TabList(): React.JSX.Element | null {
	const t = useT();
	const groups = useTerminalStore((s) => s.groups);
	const activeGroupId = useTerminalStore((s) => s.activeGroupId);
	const activePaneId = useTerminalStore((s) => s.activePaneId);
	if (groups.length === 0) return null;
	return (
		<div className="flex w-44 shrink-0 flex-col border-l border-border">
			<div className="min-h-0 flex-1 overflow-y-auto px-1 pb-1">
				{groups.map((group, groupIndex) => {
					const entries = collectTabs(group.root);
					return (
						<Fragment key={group.id}>
							{groupIndex > 0 && <div className="mx-2 my-1 h-px bg-border" />}
							{entries.map(({ pane, tab }, index) => {
								const active =
									group.id === activeGroupId && pane.id === activePaneId && pane.activeTabId === tab.id;
								// 同组多实例：┌/├/└ 前缀连线（vscode group 内实例布局线）
								const prefix =
									entries.length > 1 ? (index === 0 ? "┌" : index === entries.length - 1 ? "└" : "├") : null;
								return (
									<div
										key={tab.id}
										role="tab"
										tabIndex={0}
										title={tab.title}
										onClick={() => useTerminalStore.getState().activateTab(tab.id)}
										onAuxClick={(event) => {
											// vscode 行为：中键关闭
											if (event.button === 1) useTerminalStore.getState().closeTab(tab.id);
										}}
										onKeyDown={(event) =>
											activateOnKey(event, () => useTerminalStore.getState().activateTab(tab.id))
										}
										className={`group flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md border-l-2 px-2 py-1 text-ui-12 transition-colors ${
											active
												? "border-accent bg-hover text-ink-1"
												: "border-transparent text-ink-faint hover:bg-hover/60 hover:text-ink-2"
										}`}
									>
										{prefix && (
											<span className="shrink-0 text-ui-10 text-ink-faint opacity-60">{prefix}</span>
										)}
										<span className="min-w-0 flex-1 truncate">{tab.title}</span>
										{/* hover 操作：仅分屏 + 关闭（vscode tab action bar） */}
										<span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
											<button
												type="button"
												className="rounded p-0.5 text-ink-faint transition-colors hover:bg-hover hover:text-ink-2"
												title={t("terminal.split")}
												onClick={(event) => {
													event.stopPropagation();
													useTerminalStore.getState().splitPane(pane.id);
												}}
											>
												<SplitIcon size={16} />
											</button>
											<button
												type="button"
												className="rounded p-0.5 text-ink-faint transition-colors hover:bg-hover hover:text-ink-2"
												title={t("terminal.close")}
												onClick={(event) => {
													event.stopPropagation();
													useTerminalStore.getState().closeTab(tab.id);
												}}
											>
												<TrashIcon size={16} />
											</button>
										</span>
									</div>
								);
							})}
						</Fragment>
					);
				})}
			</div>
		</div>
	);
}

/** 顶栏工具栏按钮（vscode 面板标题栏动作） */
function ToolbarButton({
	icon,
	title,
	onClick,
	disabled = false,
}: {
	icon: React.ReactNode;
	title: string;
	onClick: () => void;
	disabled?: boolean;
}): React.JSX.Element {
	return (
		<button
			type="button"
			className={`rounded-md p-1 transition-colors ${
				disabled ? "cursor-default text-ink-faint/40" : "text-ink-faint hover:bg-hover hover:text-ink-2"
			}`}
			title={title}
			onClick={onClick}
			disabled={disabled}
		>
			{icon}
		</button>
	);
}

/**
 * 内建终端底部面板（vscode 复刻布局，group 模型）：
 * - 顶栏右侧仅 3 个动作：新建终端 / 最大化（还原）/ 隐藏终端；
 * - 内容区（左）：激活 group 的递归 split 树；其余 group 宿主 div 用 visibility 隐藏不卸载
 *   （保留滚动条与 WebGL 缓冲区，切换零重建）；
 * - 右侧竖排 tab 列表按 group 分组（vscode tabs.location: 'right'）。
 */
export function TerminalDock(): React.JSX.Element {
	const t = useT();
	const groups = useTerminalStore((s) => s.groups);
	const activeGroupId = useTerminalStore((s) => s.activeGroupId);
	const activePaneId = useTerminalStore((s) => s.activePaneId);
	const height = useTerminalStore((s) => s.height);
	const maximized = useTerminalStore((s) => s.maximized);

	// 最大化两阶段动画（Gemini 方案 flow 式）：终端高度数值过渡（flex 弹性模型接管宽度，不写宽度动画）。
	// 阶段 1（0.30s 减速）：终端从 dock 高度升到中间区全高（贴顶栏底）；侧栏同步收拢，聊天页被挤出。
	// 阶段 2（0.20s 加速，150ms 后启动）：顶栏收（App 侧同 delay）后中间区膨胀，终端再升到全视口高。
	// 退出动量时序：终端 0–300ms 单曲线下沉（无分段）；顶栏 0–160ms 下推（上限=终端顶边）；
	// 侧栏 160–340ms 滑入（translateX，左边缘派生）。
	const [animH, setAnimH] = useState<number | null>(null);
	const [animEase, setAnimEase] = useState<string | undefined>(undefined);
	// 终端面板状态机（store 层驱动，见 stores/terminal.ts TerminalPhase）：
	// opening / maximizing / restoring / hiding 动画期间 store 拒绝一切其他转换（toggle/hide/setMaximized/setOpen），
	// 这里由单一 effect 按 phase 驱动对应动画，并在完成时推进到下一静止态。
	const phase = useTerminalStore((s) => s.phase);
	const setPhase = useTerminalStore((s) => s.setPhase);
	useEffect(() => {
		switch (phase) {
			case "opening": {
				// 挂载滑入：CSS animation 关键帧（from height:0 → var(--terminal-dock-h)）由浏览器强制播放，
				// 不依赖 transition 起点（挂载首帧 0px 从未被实际绘制，transition 无起点会瞬间跳变）。
				const t = window.setTimeout(() => setPhase("open"), 300);
				return () => window.clearTimeout(t);
			}
			case "maximizing": {
				// 阶段 1（0.30s 减速）：dock 高 → 中间区全高（贴顶栏底）；阶段 2（0.20s 加速，150ms 后）：顶栏收后全视口高
				setAnimEase("height 300ms cubic-bezier(0.4, 0, 0.2, 1)");
				setAnimH(window.innerHeight - 48);
				const t2 = window.setTimeout(() => {
					setAnimEase("height 200ms cubic-bezier(0, 0, 0.2, 1)");
					setAnimH(window.innerHeight);
				}, 150);
				const t3 = window.setTimeout(() => setPhase("maximized"), 350); // 150+200 完成
				return () => {
					window.clearTimeout(t2);
					window.clearTimeout(t3);
				};
			}
			case "restoring": {
				// 还原（动量时序）：顶栏 0–160ms 下推；侧栏 60–340ms 滑入；终端 0–300ms 单曲线下沉
				setAnimEase("height 300ms cubic-bezier(0.4, 0, 0.2, 1)");
				setAnimH(useTerminalStore.getState().height);
				const t = window.setTimeout(() => {
					setAnimH(null);
					setAnimEase(undefined);
					setPhase("open");
				}, 400);
				return () => window.clearTimeout(t);
			}
			case "hiding": {
				// 隐藏（快捷键/按钮，最大化与常态统一）：终端收到底部 0，完成后面板卸载并回到 closed。
				// 最大化时顶栏/侧栏还原由 maximized→false 触发（App/Sidebar 订阅），终端收起段在这里完成。
				setAnimEase("height 300ms cubic-bezier(0.4, 0, 0.2, 1)");
				setAnimH(0);
				const t1 = window.setTimeout(() => {
					// 卸载与回 closed 必须同一 set（分开会触发本 effect 重跑并 cleanup 掉 t1/t2，面板永不卸载）
					useTerminalStore.setState({ open: false, phase: "closed" });
				}, 300);
				const t2 = window.setTimeout(() => {
					setAnimH(null);
					setAnimEase(undefined);
				}, 400);
				return () => {
					window.clearTimeout(t1);
					window.clearTimeout(t2);
				};
			}
			case "maximized": {
				// 静止最大化态：高度保持全视口（动画阶段 2 已达 innerHeight，不清空，否则面板回落 dock 高但状态仍最大化）
				setAnimH(window.innerHeight);
				setAnimEase(undefined);
				return;
			}
			default:
				setAnimH(null);
				setAnimEase(undefined);
		}
	}, [phase, setPhase]);

	// resize 自适应：最大化动画期间窗口尺寸变化时重算目标高度（阶段 2 目标=全视口高）
	useEffect(() => {
		if (phase !== "maximizing" && phase !== "maximized") return;
		const onResize = () => {
			setAnimH((h) =>
				h != null && h >= window.innerHeight - 48 ? window.innerHeight : window.innerHeight - 48,
			);
		};
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, [phase]);

	// 全局焦点表（tabId → 终端句柄）：点右侧 tab 激活时由下方 effect 统一 focus（vscode 行为：点 tab 即聚焦终端）
	const focusHandlesRef = useRef(new Map<number, TerminalViewHandle>());
	const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null;
	const activePane = activeGroup ? activePaneOf(activeGroup.root, activePaneId) : null;
	const activeTabId = activePane?.activeTabId;
	useEffect(() => {
		if (activeTabId == null) return;
		focusHandlesRef.current.get(activeTabId)?.focus();
	}, [activeTabId]);

	// 初始高度对齐持久化偏好（拖拽时由 ui-preferences preview 同步，此处只在挂载兜底一次）
	useEffect(() => {
		useTerminalStore.getState().setHeight(useUiPreferencesStore.getState().terminalHeight);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const startResizeDrag = (event: PointerEvent<HTMLDivElement>) => {
		event.preventDefault();
		const startY = event.clientY;
		const startHeight = useTerminalStore.getState().height;
		const onMove = (moveEvent: globalThis.PointerEvent) => {
			// 鼠标上移（clientY 减小）→ 面板变高；preview 内 clamp + 同步 terminal store
			useUiPreferencesStore.getState().previewTerminalHeight(startHeight + (startY - moveEvent.clientY));
		};
		const onUp = () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			useUiPreferencesStore.getState().commitTerminalHeight();
		};
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
	};

	// 状态机 effect 已由上/下方 [phase, setPhase] 统一驱动；动画中禁止其他状态转换
	const animBusy =
		phase === "opening" || phase === "maximizing" || phase === "restoring" || phase === "hiding";

	return (
		<div
			className={`relative flex min-h-0 flex-col border-t border-border bg-surface${phase === "opening" ? " terminal-slide-in" : ""}`}
			style={
				animH != null
					? { height: animH, transition: animEase }
					: ({
							height,
							["--terminal-dock-h" as string]: phase === "opening" ? `${height}px` : undefined,
						} as React.CSSProperties)
			}
		>
			{/* 拖拽手柄（面板顶部边缘）：悬浮时显示，ns-resize；最大化时无意义不显示，动画中不显示 */}
			{!maximized && animH == null && !animBusy && (
				<div
					className="group/drag relative -mt-1.5 h-1.5 shrink-0 cursor-ns-resize"
					onPointerDown={startResizeDrag}
					title={t("terminal.resize")}
				>
					<div className="absolute inset-x-8 top-0 h-px bg-border transition-colors group-hover/drag:bg-accent" />
				</div>
			)}
			{/* 顶栏：终端标题 + 工具栏（vscode 标题栏动作：新建终端 / 最大化 / 隐藏终端） */}
			<div className="flex shrink-0 items-center gap-1 px-2 py-1">
				<span
					className="flex items-center text-ink-2"
					title={t("terminal.title")}
					role="img"
					aria-label={t("terminal.title")}
				>
					<TerminalIcon size={16} />
				</span>
				<span className="min-w-0 flex-1" />
				<ToolbarButton
					icon={<PlusIcon size={16} />}
					title={t("terminal.newTab")}
					onClick={() => useTerminalStore.getState().newTerminal()}
				/>
				<ToolbarButton
					icon={maximized ? <RestoreIcon size={16} /> : <MaximizeIcon size={16} />}
					title={maximized ? t("terminal.restore") : t("terminal.maximize")}
					disabled={animBusy}
					onClick={() => useTerminalStore.getState().setMaximized(!maximized)}
				/>
				<ToolbarButton
					icon={<ChevronDownIcon size={16} />}
					title={t("terminal.hide")}
					disabled={animBusy}
					onClick={() => useTerminalStore.getState().hide()}
				/>
			</div>
			{/* 内容区（左，激活 group 的 split 树）+ 右侧 tab 列表；overflow-hidden 裁剪动画期间 xterm 内容溢出 */}
			<div className="relative flex min-h-0 flex-1 overflow-hidden p-1 pt-0">
				<div className="relative min-h-0 min-w-0 flex-1">
					{groups.length > 0 ? (
						groups.map((group) => (
							<div
								key={group.id}
								className={
									group.id === activeGroupId
										? "absolute inset-0"
										: "absolute inset-0 invisible pointer-events-none"
								}
							>
								<TerminalSplitView node={group.root} groupId={group.id} focusHandles={focusHandlesRef} />
							</div>
						))
					) : (
						<div className="flex h-full flex-col items-center justify-center gap-2 text-ui-12 text-ink-faint">
							<span>{t("terminal.empty")}</span>
							<button
								type="button"
								className="flex items-center gap-1 rounded-md px-2 py-1 text-ui-12 text-ink-2 transition-colors hover:bg-hover"
								title={t("terminal.openNew")}
								onClick={() => useTerminalStore.getState().newTerminal()}
							>
								<PlusIcon size={12} />
								{t("terminal.openNew")}
							</button>
						</div>
					)}
				</div>
				{groups.length > 0 && <TabList />}
			</div>
		</div>
	);
}
