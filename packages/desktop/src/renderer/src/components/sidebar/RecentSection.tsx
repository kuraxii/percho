import type { SessionMeta } from "@percho/shared";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useT } from "../../i18n";
import { recentProjectLabel } from "../../lib/recent-sessions";
import { useProjectsStore } from "../../stores/projects";
import { sessionTitle, useSessionStatus } from "../session/session-status";
import type { MenuAnchor } from "../ui/place-menu";
import { useSessionMenu } from "./SessionMenu";

/** 行尾状态点（与 `SessionRow` 同一套语义与颜色：待审批琥珀 / 工作中墨色呼吸 / 完成未读绿 / 空闲无点）。
 *  Tailwind 需要在源码里出现完整类名，所以不做字符串拼接。 */
const DOT_CLASS: Record<string, string> = {
	attention: "bg-amber-500",
	working: "bg-ink sidebar-dot-working",
	done: "bg-green-500",
};

/** 单行高度：与 `SessionRow` 的 34px 行容器对齐，让「最近」与下面的树读起来是同一份列表的两种视图 */
const ROW_HEIGHT = 34;

/**
 * 左栏「最近」一行：标题 + 极淡项目名标签 + 状态点。
 *
 * 与 `SessionRow` 分开写而不是加参数复用，是因为两者几何不同：树行要画指引线、要缩进、要折叠箭头，
 * 而「最近」是平铺的跨项目快照 —— 硬塞进一个组件会让两边都长出一堆 `recent &&` 分支。
 * 但**语义**必须与树行一致：同一份标题回落、同一套状态点、同一条 `openSession` 打开路径、同一个右键菜单。
 */
function RecentRow({
	session,
	active,
	onSelect,
	onContextMenu,
}: {
	session: SessionMeta;
	active: boolean;
	onSelect: () => void;
	onContextMenu?: (anchor: MenuAnchor) => void;
}) {
	const t = useT();
	const status = useSessionStatus(session.sessionId);
	const title = sessionTitle(session, t("projects.untitled"), t("projects.daily"));
	const projectLabel = recentProjectLabel(session, t("projects.daily"));
	return (
		<button
			type="button"
			data-recent-session-id={session.sessionId}
			data-recent-session-active={active ? "true" : "false"}
			className={`mb-[2px] flex w-full items-center gap-2 rounded-lg px-1.5 text-left text-ui-135 ${
				active ? "bg-bubble font-semibold text-ink" : "text-ink-2 hover:bg-hover hover:text-ink"
			}`}
			style={{ height: ROW_HEIGHT - 2 }}
			onClick={onSelect}
			onContextMenu={
				onContextMenu
					? (e: ReactMouseEvent<HTMLButtonElement>) => {
							e.preventDefault();
							onContextMenu({ left: e.clientX, top: e.clientY, width: 0, height: 0 });
						}
					: undefined
			}
		>
			<span className="min-w-0 flex-1 truncate">{title}</span>
			{/* 项目标签：极淡、不参与交互，只用来区分跨项目的同名会话 */}
			{projectLabel && (
				<span className="max-w-24 shrink-0 truncate text-ui-11 text-ink-faint">{projectLabel}</span>
			)}
			{status !== "idle" && (
				<span
					className={`mr-0.5 h-[7px] w-[7px] shrink-0 rounded-full ${DOT_CLASS[status]}`}
					aria-hidden="true"
				/>
			)}
		</button>
	);
}

/**
 * 「最近」分组（左栏「日常」之下、「项目」之上）：固定 `RECENT_LIMIT` 条、**不滚动、不分批、不能收起**。
 *
 * 为什么不做成可折叠分组：它只有 8 行，收起反而多一次点击；真正的「收起」是左栏本身。
 * 为什么不分批（没有「显示更多」）：那会把跳板变成长列表，和下面的项目树重复。
 *
 * 数据：`recent` 由 Sidebar 用纯函数派生后传入（跨项目、按落盘的 `recentSessions` 顺序），本组件不排序、不裁剪 ——
 * 与 `SidebarSessionList` 同一纪律：显示层只画调用方给的这一段。
 */
export function RecentSection({
	recent,
	activeSessionId,
}: {
	recent: readonly { session: SessionMeta }[];
	activeSessionId: string | null;
}) {
	const t = useT();
	const openSession = useProjectsStore((s) => s.openSession);
	const sessionMenu = useSessionMenu();
	// 空态**不渲染整个区块**：新装/新的一天还没有「最近」时，多一个空标题只是噪声
	if (recent.length === 0) return null;
	return (
		<div data-sidebar-recent="">
			{/* 标题行：与 `ProjectRow` 同高同缩进，但不可点击（不是分组开关，没有折叠语义） */}
			<div
				className="flex items-center gap-2 px-1.5 text-ui-14 font-medium text-ink-2"
				style={{ height: ROW_HEIGHT }}
			>
				<span className="min-w-0 flex-1 truncate text-left">{t("sidebar.recent")}</span>
			</div>
			{recent.map(({ session }) => (
				<RecentRow
					key={session.sessionId}
					session={session}
					active={session.sessionId === activeSessionId}
					onSelect={() => void openSession(session)}
					onContextMenu={(anchor) => sessionMenu.open(session, anchor)}
				/>
			))}
			{sessionMenu.element}
		</div>
	);
}
