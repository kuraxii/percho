import { getPi } from "../../api";
import { useT } from "../../i18n";
import { useUiStore } from "../../stores/ui";
import { useUiPreferencesStore } from "../../stores/ui-preferences";
import { DiffIcon, PanelLeftIcon } from "../icons";

/**
 * 顶栏：只剩窗口拖动区 + 两个开关（左栏开合、diff 侧栏）。
 *
 * 原来中间是会话 tab 条（临时会话工作区的胶囊，可拖拽排序、可 ×）。那条东西被**删除**了，
 * 因为它解决的问题（工作集、快速来回切）用「左栏最近」表达更便宜：
 * tab 要占横向空间、要手动关、会泛滥、还要求把会话塞进编辑器区的交互模型里。
 * 节点与顺序由 `lib/recent-sessions.ts` 从「最近打开」派生，不需要一份成员表。
 *
 * macOS hiddenInset 红绿灯在左（预留 pl-20）；Windows 系统按钮覆盖层在右（预留 pr-[140px]）；
 * Linux 原生框架两侧均不预留。
 */
export function TopBar() {
	const t = useT();
	const platform = getPi().platform;
	const diffSidebarOpen = useUiStore((s) => s.diffSidebarOpen);
	const toggleDiffSidebar = useUiStore((s) => s.toggleDiffSidebar);
	const sidebarCollapsed = useUiPreferencesStore((s) => s.sidebarCollapsed);
	const toggleSidebarCollapsed = useUiPreferencesStore((s) => s.toggleSidebarCollapsed);

	// macOS 左侧为红绿灯留 80px；Windows 右侧为窗口按钮覆盖层留 140px（3 × 46px 取整）
	const chromePadding =
		platform === "darwin" ? "pl-20 pr-3" : platform === "win32" ? "pl-3 pr-[140px]" : "pl-3 pr-3";

	return (
		<div className={`drag-region flex h-12 shrink-0 items-center gap-1 bg-canvas ${chromePadding}`}>
			{/* 左栏开合（右栏 diff 图标的镜像）：开态底色区分；左栏收起后展开也靠它，设置入口就在左栏里 */}
			<button
				type="button"
				// 可测试性只读属性（CDP 验收按它点左栏开合，避免按 aria-label 文案匹配；不影响视觉/交互）
				data-sidebar-toggle=""
				className={`no-drag shrink-0 rounded-lg p-1.5 transition-colors ${
					sidebarCollapsed ? "text-ink-dim hover:bg-hover hover:text-ink" : "bg-hover text-ink"
				}`}
				onClick={toggleSidebarCollapsed}
				aria-label={sidebarCollapsed ? t("sidebar.expand") : t("sidebar.collapse")}
			>
				<PanelLeftIcon size={16} />
			</button>
			{/* 中间留空：整条都是窗口拖动区（原来这里排满会话胶囊） */}
			<div className="min-w-0 flex-1" />
			{/* diff 侧栏开关：active 态底色区分 */}
			<button
				type="button"
				className={`no-drag relative shrink-0 rounded-lg p-1.5 transition-colors ${
					diffSidebarOpen ? "bg-hover text-ink" : "text-ink-dim hover:bg-hover hover:text-ink"
				}`}
				onClick={toggleDiffSidebar}
				aria-label={t("diff.toggle")}
			>
				<DiffIcon size={16} />
			</button>
		</div>
	);
}
