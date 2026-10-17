import { TERMINAL_DEFAULT_HEIGHT } from "@percho/shared";
import { create } from "zustand";

/**
 * 内建终端 UI 状态（v4，vscode 式 group 模型）：
 * - 终端 = 一个或多个 group；group 是独立的分屏树（vscode「split 的一组 / 独立终端也是一个 group」语义）；
 * - 每个 group 内部是递归 split 树：pane（一组 tab 串行切换）之间可左右/上下并排（split）；
 * - split 语义：在 pane 的最近 row 祖先平铺插入新 pane（root pane → 建 row split）；
 *   col 祖先内 split 则新建 row 嵌套（交替方向，vscode「A|B 中再 split A → 上下分」直觉）；
 * - 终端主界面一次只显示激活 group 的分屏树，其余 group 的 DOM 不销毁（visibility 隐藏，
 *   保留 xterm buffer / 滚动位置 / WebGL 上下文，切回不重 spawn、不丢输出）；
 * - 面板收起（open=false）保留所有 group 与 pty 进程（vscode 行为），关闭某个 tab 才 kill 对应 pty；
 * - 关闭 group 的最后一个 tab → 整个 group 移除，激活相邻 group。
 */
export interface TerminalHandleState {
	id: number;
	pid: number;
	/** 实际启动的 shell 路径（默认 tab 标题用其 basename，如 zsh/bash） */
	shell: string;
}

export type TerminalTabStatus = "launching" | "running" | "exited";

export interface TerminalTab {
	/** renderer 自增 tab id（≠ pty id） */
	id: number;
	handle: TerminalHandleState | null;
	title: string;
	status: TerminalTabStatus;
}

export type TerminalDir = "row" | "col";

/** 一个分屏面板：内部多 tab 串行切换（同一 xterm 区叠放） */
export interface TerminalPane {
	kind: "pane";
	id: number;
	tabs: TerminalTab[];
	activeTabId: number | null;
}

/** 分屏节点：子节点按 direction 并排 */
export interface TerminalSplitNode {
	kind: "split";
	id: number;
	direction: TerminalDir;
	children: TerminalNode[];
}

export type TerminalNode = TerminalPane | TerminalSplitNode;

/** 终端 group：一份独立的 split 树（root 恒非空，至少一个 pane） */
export interface TerminalGroup {
	id: number;
	root: TerminalNode;
}

let nextId = 1;
let terminalCounter = 0;
const newId = (): number => nextId++;

/** 新建一个 launching tab（标题可自定义；不指定时按全局序号 Terminal N） */
export function createTab(title?: string): TerminalTab {
	return {
		id: newId(),
		handle: null,
		title: title ?? `Terminal ${++terminalCounter}`,
		status: "launching",
	};
}

/** 新建一个独立 group：单 pane 单 tab（vscode「独立终端也是一个 group」） */
export function createGroup(): TerminalGroup {
	return { id: newId(), root: createPane([createTab()]) };
}

// ── 纯树工具（export 供测试）──────────────────────────────────────────────

export function createPane(tabs: TerminalTab[]): TerminalPane {
	return { kind: "pane", id: newId(), tabs, activeTabId: tabs[0]?.id ?? null };
}

/** 按 pane id 查找 */
export function findPane(node: TerminalNode | null, paneId: number): TerminalPane | null {
	if (!node) return null;
	if (node.kind === "pane") return node.id === paneId ? node : null;
	for (const child of node.children) {
		const hit = findPane(child, paneId);
		if (hit) return hit;
	}
	return null;
}

/** 按 tab id 找其所属 pane id */
export function findPaneIdByTab(node: TerminalNode | null, tabId: number): number | null {
	if (!node) return null;
	if (node.kind === "pane") {
		return node.tabs.some((t) => t.id === tabId) ? node.id : null;
	}
	for (const child of node.children) {
		const hit = findPaneIdByTab(child, tabId);
		if (hit) return hit;
	}
	return null;
}

/** 深度优先第一个 pane id（新建 tab 的默认落点） */
export function firstPaneId(node: TerminalNode | null): number | null {
	if (!node) return null;
	if (node.kind === "pane") return node.id;
	for (const child of node.children) {
		const hit = firstPaneId(child);
		if (hit) return hit;
	}
	return null;
}

/** 当前有效 pane：优先 activePaneId，否则 root pane，否则树中第一个 pane */
export function activePaneOf(root: TerminalNode | null, activePaneId: number | null): TerminalPane | null {
	if (!root) return null;
	const target = activePaneId != null ? findPane(root, activePaneId) : null;
	if (target) return target;
	if (root.kind === "pane") return root;
	const first = firstPaneId(root);
	return first == null ? null : findPane(root, first);
}

/** 树序展开所有 (pane, tab) 对（右侧 tab 列表用） */
export function collectTabs(node: TerminalNode | null): Array<{ pane: TerminalPane; tab: TerminalTab }> {
	if (!node) return [];
	if (node.kind === "pane") return node.tabs.map((tab) => ({ pane: node, tab }));
	return node.children.flatMap((child) => collectTabs(child));
}

/** 更新指定 pane（fn 返回新 pane） */
export function updatePane(
	node: TerminalNode,
	paneId: number,
	fn: (pane: TerminalPane) => TerminalPane,
): TerminalNode {
	if (node.kind === "pane") return node.id === paneId ? fn(node) : node;
	return { ...node, children: node.children.map((child) => updatePane(child, paneId, fn)) };
}

/** 更新指定 tab（fn 返回新 tab） */
export function updateTab(
	node: TerminalNode,
	tabId: number,
	fn: (tab: TerminalTab) => TerminalTab,
): TerminalNode {
	if (node.kind === "pane") {
		return { ...node, tabs: node.tabs.map((tab) => (tab.id === tabId ? fn(tab) : tab)) };
	}
	return { ...node, children: node.children.map((child) => updateTab(child, tabId, fn)) };
}

/**
 * split：在 pane 位置插入新 pane（自带一个 launching tab）。
 * - pane 是 root → 包成 row split；
 * - pane 在 row split 内 → 平铺插入其后（多 pane 同层横排）；
 * - pane 在 col split 内 → 新建 row split 嵌套包住它（交替方向）。
 */
export function splitAt(root: TerminalNode, paneId: number): { root: TerminalNode; newPane: TerminalPane } {
	const newPane = createPane([createTab()]);
	const place = (node: TerminalNode): { node: TerminalNode; placed: boolean } => {
		if (node.kind === "pane") {
			if (node.id !== paneId) return { node, placed: false };
			return {
				node: { kind: "split", id: newId(), direction: "row", children: [node, newPane] },
				placed: true,
			};
		}
		const children: TerminalNode[] = [];
		let placed = false;
		for (const child of node.children) {
			if (!placed && child.kind === "pane" && child.id === paneId) {
				if (node.direction === "row") {
					children.push(child, newPane);
				} else {
					children.push({ kind: "split", id: newId(), direction: "row", children: [child, newPane] });
				}
				placed = true;
			} else if (!placed && child.kind === "split") {
				const r = place(child);
				children.push(r.node);
				placed = r.placed;
			} else {
				children.push(child);
			}
		}
		return { node: { ...node, children }, placed };
	};
	return { root: place(root).node, newPane };
}

/** 移除一个 tab；pane 空 → 整 pane 移除，split 只剩 1 子时提升（收缩） */
export function removeTabFromTree(
	root: TerminalNode,
	tabId: number,
): { root: TerminalNode | null; removed: boolean } {
	const removeFromPane = (pane: TerminalPane): { pane: TerminalPane; removed: boolean } => {
		const index = pane.tabs.findIndex((t) => t.id === tabId);
		if (index === -1) return { pane, removed: false };
		const tabs = pane.tabs.filter((t) => t.id !== tabId);
		const activeTabId =
			pane.activeTabId === tabId ? (tabs[index - 1]?.id ?? tabs[0]?.id ?? null) : pane.activeTabId;
		return { pane: { ...pane, tabs, activeTabId }, removed: true };
	};
	const walk = (node: TerminalNode): TerminalNode | null => {
		if (node.kind === "pane") {
			const r = removeFromPane(node);
			if (!r.removed) return node;
			if (r.pane.tabs.length === 0) return null;
			return r.pane;
		}
		const children = node.children.map(walk).filter((c): c is TerminalNode => c !== null);
		if (children.length === 0) return null;
		if (children.length === 1) return children[0] ?? null;
		return { ...node, children };
	};
	return { root: walk(root), removed: true };
}

// ── group 辅助（export 供测试）───────────────────────────────────────────

/** 按 tab id 找所属 group + pane */
export function tabGroup(
	groups: TerminalGroup[],
	tabId: number,
): { group: TerminalGroup; pane: TerminalPane } | null {
	for (const group of groups) {
		const paneId = findPaneIdByTab(group.root, tabId);
		if (paneId === null) continue;
		const pane = findPane(group.root, paneId);
		if (pane) return { group, pane };
	}
	return null;
}

/** 按 pane id 找所属 group + pane */
export function paneGroup(
	groups: TerminalGroup[],
	paneId: number,
): { group: TerminalGroup; pane: TerminalPane } | null {
	for (const group of groups) {
		const pane = findPane(group.root, paneId);
		if (pane) return { group, pane };
	}
	return null;
}

/** 更新所有 group 中含指定 tab 的树（找不到则原样返回，安全） */
export function updateTabInGroups(
	groups: TerminalGroup[],
	tabId: number,
	fn: (tab: TerminalTab) => TerminalTab,
): TerminalGroup[] {
	return groups.map((group) => ({ ...group, root: updateTab(group.root, tabId, fn) }));
}

interface TerminalStore {
	open: boolean;
	/** 全部终端 group（vscode 语义：split 的一组 / 独立终端也是 group） */
	groups: TerminalGroup[];
	/** 当前显示的 group（终端主界面一次只显示一个 group 的分屏树） */
	activeGroupId: number | null;
	/** 激活 group 内最近交互过的 pane（分屏/新建的默认落点） */
	activePaneId: number | null;
	/** 渲染期面板高度（px），初始/持久化值来自 ui-preferences */
	height: number;
	/** 面板最大化（覆盖整个窗口，vscode 终端最大化语义） */
	maximized: boolean;
	setOpen: (open: boolean) => void;
	toggle: () => void;
	/**
	 * 新建独立终端（= 新 group，单 pane 单 tab，激活显示），返回 tab id。
	 * vscode「独立终端也是一个 group」：＋ 按钮永远开一个独立 group。
	 */
	newTerminal: () => number;
	/** 关闭 tab：移除 UI 条目并收缩树；group 空则整组移除并激活相邻 group；pty 由组件卸载 cleanup 负责 close */
	closeTab: (tabId: number) => void;
	/** 激活 tab：切到其所在 group + pane（vscode 点击 tab 即切换 group） */
	activateTab: (tabId: number) => void;
	/** split 指定 pane（新 pane 自带一个 shell；作用于 pane 所在 group） */
	splitPane: (paneId: number) => void;
	/** 点击分屏区域：激活 group + pane（焦点透传由组件层负责） */
	activatePane: (groupId: number, paneId: number) => void;
	setTabHandle: (tabId: number, handle: TerminalHandleState) => void;
	/** 标题：默认 shell 名，OSC 7/9;9/1337 CurrentDir 更新为 cwd 名，OSC 0/2 显式标题覆盖 */
	setTabTitle: (tabId: number, title: string) => void;
	markTabExited: (tabId: number) => void;
	/** 拖拽预览：只改内存高度（持久化交 ui-preferences.commitTerminalHeight） */
	setHeight: (px: number) => void;
	setMaximized: (maximized: boolean) => void;
}

export const useTerminalStore = create<TerminalStore>((set) => ({
	open: false,
	groups: [],
	activeGroupId: null,
	activePaneId: null,
	height: TERMINAL_DEFAULT_HEIGHT,
	maximized: false,
	setOpen: (open) => set({ open }),
	toggle: () =>
		set((state) => {
			if (state.open) return { open: false };
			// 首次打开（或全部终端关闭后重开）：默认建一个 shell，而不是空面板
			if (state.groups.length === 0) {
				const group = createGroup();
				return {
					open: true,
					groups: [group],
					activeGroupId: group.id,
					activePaneId: firstPaneId(group.root),
				};
			}
			return { open: true };
		}),
	newTerminal: () => {
		const group = createGroup();
		const tabId = group.root.kind === "pane" && group.root.tabs[0] ? group.root.tabs[0].id : -1;
		set((state) => ({
			groups: [...state.groups, group],
			activeGroupId: group.id,
			activePaneId: firstPaneId(group.root),
		}));
		return tabId;
	},
	closeTab: (tabId) =>
		set((state) => {
			const hit = tabGroup(state.groups, tabId);
			if (!hit) return state;
			const { root } = removeTabFromTree(hit.group.root, tabId);
			let groups = state.groups;
			let activeGroupId = state.activeGroupId;
			let activePaneId = state.activePaneId;
			if (root === null) {
				// 组内最后一个 tab 被关 → 整个 group 移除（vscode：kill 最后一个实例回收 group）
				const index = groups.findIndex((g) => g.id === hit.group.id);
				groups = groups.filter((g) => g.id !== hit.group.id);
				if (activeGroupId === hit.group.id) {
					const neighbor = groups[index - 1] ?? groups[index] ?? null;
					activeGroupId = neighbor?.id ?? null;
				}
				activePaneId = null;
			} else {
				groups = groups.map((g) => (g.id === hit.group.id ? { ...g, root } : g));
			}
			// 修正 activePaneId：指向激活 group 内仍存在的 pane，否则首 pane
			const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null;
			if (activeGroup) {
				if (activePaneId === null || !findPane(activeGroup.root, activePaneId)) {
					activePaneId = firstPaneId(activeGroup.root);
				}
			} else {
				activePaneId = null;
			}
			return { groups, activeGroupId, activePaneId };
		}),
	activateTab: (tabId) =>
		set((state) => {
			const hit = tabGroup(state.groups, tabId);
			if (!hit) return state;
			return {
				activeGroupId: hit.group.id,
				activePaneId: hit.pane.id,
				groups: state.groups.map((g) =>
					g.id === hit.group.id
						? {
								...g,
								root: updatePane(g.root, hit.pane.id, (p) => ({ ...p, activeTabId: tabId })),
							}
						: g,
				),
			};
		}),
	splitPane: (paneId) =>
		set((state) => {
			const hit = paneGroup(state.groups, paneId);
			if (!hit) return state;
			const { root } = splitAt(hit.group.root, paneId);
			return {
				activeGroupId: hit.group.id,
				activePaneId: paneId,
				groups: state.groups.map((g) => (g.id === hit.group.id ? { ...g, root } : g)),
			};
		}),
	activatePane: (groupId, paneId) => set({ activeGroupId: groupId, activePaneId: paneId }),
	setTabHandle: (tabId, handle) =>
		set((state) => ({
			groups: updateTabInGroups(state.groups, tabId, (t) => ({ ...t, handle, status: "running" })),
		})),
	// 标题：默认 shell 名（spawn 回执），OSC 7/9;9/1337 CurrentDir 更新为 cwd 名，OSC 0/2 显式标题覆盖
	setTabTitle: (tabId, title) =>
		set((state) => ({
			groups: updateTabInGroups(state.groups, tabId, (t) => ({ ...t, title })),
		})),
	markTabExited: (tabId) =>
		set((state) => ({
			groups: updateTabInGroups(state.groups, tabId, (t) => ({ ...t, status: "exited" })),
		})),
	setHeight: (px) => set({ height: px }),
	setMaximized: (maximized) => set({ maximized }),
}));
