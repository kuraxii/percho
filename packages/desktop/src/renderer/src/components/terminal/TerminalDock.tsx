import { Fragment, type KeyboardEvent, type PointerEvent, useEffect, useRef } from "react";
import { useT } from "../../i18n";
import { collectTabs, type TerminalNode, type TerminalPane, useTerminalStore } from "../../stores/terminal";
import { useUiPreferencesStore } from "../../stores/ui-preferences";
import { ChevronDownIcon, MaximizeIcon, PlusIcon, RestoreIcon, SplitIcon, TerminalIcon, TrashIcon } from "../icons";
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
function PaneView({ pane, groupId }: { pane: TerminalPane; groupId: number }): React.JSX.Element {
	const focusHandles = useRef(new Map<number, TerminalViewHandle>());
	return (
		<div
			className="relative h-full min-h-0 min-w-0 flex-1"
			onPointerDown={() => {
				useTerminalStore.getState().activatePane(groupId, pane.id);
				// xterm 可能在随后的 mousedown/click 处理中重置焦点：本帧 focus + 下一帧兜底，
				// 确保分屏点击后键盘输入落在目标终端
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

/** 递归 split 树：row = 左右并排（divider 竖线），col = 上下并排（divider 横线） */
function TerminalSplitView({ node, groupId }: { node: TerminalNode; groupId: number }): React.JSX.Element {
	if (node.kind === "pane") return <PaneView pane={node} groupId={groupId} />;
	const row = node.direction === "row";
	return (
		<div className={`flex h-full min-h-0 w-full ${row ? "flex-row" : "flex-col"}`}>
			{node.children.map((child, index) => (
				<Fragment key={child.id}>
					{index > 0 && <div className={`shrink-0 bg-border ${row ? "w-px" : "h-px"}`} />}
					<div className="min-h-0 min-w-0 flex-1">
						<TerminalSplitView node={child} groupId={groupId} />
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
								const active = group.id === activeGroupId && pane.activeTabId === tab.id;
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
}: {
	icon: React.ReactNode;
	title: string;
	onClick: () => void;
}): React.JSX.Element {
	return (
		<button
			type="button"
			className="rounded-md p-1 text-ink-faint transition-colors hover:bg-hover hover:text-ink-2"
			title={title}
			onClick={onClick}
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
	const height = useTerminalStore((s) => s.height);
	const maximized = useTerminalStore((s) => s.maximized);

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

	return (
		<div
			className={
				maximized
					? "terminal-slide-up fixed inset-0 z-40 flex min-h-0 flex-col bg-surface"
					: "terminal-slide-up relative flex min-h-0 flex-col border-t border-border bg-surface"
			}
			style={maximized ? undefined : { height }}
		>
			{/* 拖拽手柄（面板顶部边缘）：悬浮时显示，ns-resize；最大化时无意义不显示 */}
			{!maximized && (
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
					onClick={() => useTerminalStore.getState().setMaximized(!maximized)}
				/>
				<ToolbarButton
					icon={<ChevronDownIcon size={16} />}
					title={t("terminal.hide")}
					onClick={() => useTerminalStore.getState().setOpen(false)}
				/>
			</div>
			{/* 内容区（左，激活 group 的 split 树）+ 右侧 tab 列表 */}
			<div className="relative flex min-h-0 flex-1 p-1 pt-0">
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
								<TerminalSplitView node={group.root} groupId={group.id} />
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
