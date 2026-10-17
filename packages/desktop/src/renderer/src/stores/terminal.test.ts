import { describe, expect, it } from "vitest";
import {
	activePaneOf,
	collectTabs,
	createGroup,
	createPane,
	createTab,
	findPane,
	findPaneIdByTab,
	firstPaneId,
	paneGroup,
	removeTabFromTree,
	splitAt,
	type TerminalNode,
	type TerminalPane,
	type TerminalSplitNode,
	type TerminalTab,
	tabGroup,
	updatePane,
	updateTab,
	updateTabInGroups,
	useTerminalStore,
} from "./terminal";

/** 断言 node 是 split 并返回 */
function asSplit(node: TerminalNode | undefined): TerminalSplitNode {
	if (node?.kind !== "split") throw new Error("expected split node");
	return node;
}

/** 断言 node 是 pane 并返回 */
function asPane(node: TerminalNode | undefined): TerminalPane {
	if (node?.kind !== "pane") throw new Error("expected pane node");
	return node;
}

/** 取 pane 第 index 个 tab（测试前置保证存在） */
function tabOf(pane: TerminalPane, index = 0): TerminalTab {
	const tab = pane.tabs[index];
	if (!tab) throw new Error("missing tab");
	return tab;
}

/** 构造单 tab pane（标题自定义） */
function paneWith(title: string): TerminalPane {
	return createPane([createTab(title)]);
}

describe("terminal split 树", () => {
	it("root pane 被 split → 包成 row split（两 pane，新 pane 自带一个 launching tab）", () => {
		const pane = paneWith("A");
		const { root, newPane } = splitAt(pane, pane.id);
		const split = asSplit(root);
		expect(split.direction).toBe("row");
		expect(split.children).toHaveLength(2);
		expect(asPane(split.children[0])).toBe(pane); // 原 pane 保留原位
		expect(asPane(split.children[1])).toBe(newPane);
		expect(newPane.tabs).toHaveLength(1);
		expect(tabOf(newPane).status).toBe("launching");
	});

	it("row split 内再 split → 平铺同层（3 pane 横排）", () => {
		const p1 = paneWith("A");
		const { root: r1 } = splitAt(p1, p1.id); // row [A, B]
		const { root: r2 } = splitAt(r1, p1.id); // 再 split A → row [A, C, B]
		const split = asSplit(r2);
		expect(split.direction).toBe("row");
		expect(split.children).toHaveLength(3);
	});

	it("col 父内 split → 新建 row 嵌套包住原 pane（交替方向）", () => {
		const p1 = paneWith("A");
		const p2 = paneWith("B");
		const colRoot: TerminalSplitNode = { kind: "split", id: 1, direction: "col", children: [p1, p2] };
		const { root } = splitAt(colRoot, p1.id);
		const split = asSplit(root);
		expect(split.direction).toBe("col");
		const first = asSplit(split.children[0]);
		expect(first.direction).toBe("row");
		expect(first.children).toHaveLength(2);
		expect(asPane(first.children[0])).toBe(p1);
	});

	it("findPane / findPaneIdByTab / firstPaneId", () => {
		const p1 = paneWith("A");
		const { root, newPane } = splitAt(p1, p1.id);
		expect(findPane(root, p1.id)).toBe(p1);
		expect(findPane(root, newPane.id)).toBe(newPane);
		const added = createPane([createTab("B")]);
		expect(findPaneIdByTab(root, tabOf(p1).id)).toBe(p1.id);
		expect(findPaneIdByTab(root, tabOf(added).id)).toBeNull();
		expect(firstPaneId(root)).toBe(p1.id);
	});

	it("activePaneOf / collectTabs：activePane 优先，其次 root pane，其次首 pane；树序收集", () => {
		const p1 = paneWith("A");
		const p2 = paneWith("B");
		const split: TerminalSplitNode = { kind: "split", id: 1, direction: "row", children: [p1, p2] };
		expect(activePaneOf(split, p2.id)).toBe(p2); // activePaneId 优先
		expect(activePaneOf(split, null)).toBe(p1); // root 是 split → 首 pane
		expect(activePaneOf(p2, null)).toBe(p2); // root pane
		expect(activePaneOf(null, null)).toBeNull();
		expect(collectTabs(split).map((e) => e.tab.title)).toEqual(["A", "B"]);
		expect(collectTabs(split).map((e) => e.pane.id)).toEqual([p1.id, p2.id]);
		expect(collectTabs(null)).toEqual([]);
	});

	it("updatePane / updateTab 保持结构", () => {
		const p1 = paneWith("A");
		const updated = asPane(updatePane(p1, p1.id, (p) => ({ ...p, activeTabId: null })));
		expect(updated.activeTabId).toBeNull();
		const tab = tabOf(p1);
		const updated2 = asPane(updateTab(p1, tab.id, (t) => ({ ...t, status: "running" })));
		expect(tabOf(updated2).status).toBe("running");
	});
});

describe("removeTabFromTree 收缩", () => {
	it("关掉 pane 的一个 tab → 保留 pane，activeTabId 回退到相邻 tab", () => {
		const p1 = createPane([createTab("A"), createTab("B")]);
		p1.activeTabId = tabOf(p1).id;
		const { root, removed } = removeTabFromTree(p1, tabOf(p1).id);
		expect(removed).toBe(true);
		expect(root).not.toBeNull();
		if (!root) return;
		const pane = asPane(root);
		expect(pane.tabs).toHaveLength(1);
		expect(tabOf(pane).title).toBe("B");
		expect(pane.activeTabId).toBe(tabOf(pane).id);
	});

	it("关掉 pane 最后一个 tab → pane 移除；root 单 pane 变 null", () => {
		const p1 = paneWith("A");
		const { root } = removeTabFromTree(p1, tabOf(p1).id);
		expect(root).toBeNull();
	});

	it("split 中关掉一 pane 最后 tab → 收缩剩单 pane（提升）", () => {
		const p1 = paneWith("A");
		const { root: r1, newPane } = splitAt(p1, p1.id); // row [A, B]
		const { root: r2 } = removeTabFromTree(r1, tabOf(newPane).id);
		expect(r2).not.toBeNull();
		if (!r2) return;
		const pane = asPane(r2);
		expect(tabOf(pane).title).toBe("A");
	});

	it("深层 split 收缩：关掉中间 pane → 树保持合法", () => {
		const p1 = paneWith("A");
		const { root: r1 } = splitAt(p1, p1.id); // row [A, B]
		const aPane = asPane(asSplit(r1).children[0]);
		const { root: r2 } = splitAt(r1, aPane.id); // row 平铺 [A, C, B]
		const cPane = asPane(asSplit(r2).children[1]);
		const { root: r3, removed } = removeTabFromTree(r2, tabOf(cPane).id);
		expect(removed).toBe(true);
		const split3 = asSplit(r3 ?? undefined);
		expect(split3.children).toHaveLength(2);
		expect(tabOf(asPane(split3.children[0])).title).toBe("A");
	});
});

describe("terminal group 模型", () => {
	it("createGroup：独立 group 单 pane 单 tab", () => {
		const g = createGroup();
		expect(g.root.kind).toBe("pane");
		if (g.root.kind !== "pane") return;
		expect(g.root.tabs).toHaveLength(1);
		expect(g.root.activeTabId).toBe(g.root.tabs[0]?.id ?? null);
	});

	it("tabGroup / paneGroup 跨 group 查找", () => {
		const g1 = createGroup();
		const g2 = createGroup();
		const groups = [g1, g2];
		const t1 = g1.root.kind === "pane" ? (g1.root.tabs[0] ?? null) : null;
		expect(t1).not.toBeNull();
		if (!t1) return;
		const hit = tabGroup(groups, t1.id);
		expect(hit?.group.id).toBe(g1.id);
		const p2 = g2.root.kind === "pane" ? (g2.root.tabs[0] ?? null) : null;
		expect(paneGroup(groups, g2.root.kind === "pane" ? g2.root.id : -1)?.group.id).toBe(g2.id);
		expect(tabGroup(groups, 99999)).toBeNull();
		expect(paneGroup(groups, 99999)).toBeNull();
		void p2;
	});

	it("updateTabInGroups：跨 group 更新目标 tab，找不到原样", () => {
		const g1 = createGroup();
		const g2 = createGroup();
		const t = g1.root.kind === "pane" ? (g1.root.tabs[0] ?? null) : null;
		if (!t) return;
		const updated = updateTabInGroups([g1, g2], t.id, (tab) => ({ ...tab, status: "running" }));
		const updated0 = updated[0];
		expect(updated0?.root.kind).toBe("pane");
		if (updated0?.root.kind !== "pane") return;
		expect(updated0.root.tabs[0]?.status).toBe("running");
		expect(updated[1]).toEqual(g2); // 未命中保持原引用
	});

	it("setTabTitle：跨 group 更新标题", () => {
		const store = useTerminalStore.getState();
		const tabId = store.newTerminal();
		store.setTabTitle(tabId, "zsh");
		const hit = tabGroup(useTerminalStore.getState().groups, tabId);
		expect(hit?.pane.tabs.find((t) => t.id === tabId)?.title).toBe("zsh");
		useTerminalStore.setState({ open: false, groups: [], activeGroupId: null, activePaneId: null });
	});
});
