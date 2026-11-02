import type { SessionMeta } from "@percho/shared";
import { isDailyCwd } from "./daily";
import { pathLastSegment } from "./path-display";

/**
 * 左栏「最近」列表的纯派生层：跨项目挑出**最近被你打开或交互过**的会话，固定 `RECENT_LIMIT` 条。
 *
 * 它接替了顶栏的会话 tab（临时工作区）。差别是刻意的，也是这套设计能站住的原因：
 * - **不占横向空间**、不需要手动关、不会泛滥 —— 没有「成员表」这回事，全由这份派生算出来；
 * - **跨项目**：不按 cwd 过滤。要找的是「刚才那个会话」，不该先展开项目再翻；
 * - **固定条数、不滚动**：它只是跳板，不是第二个完整列表；全量去下面的项目分组或搜索。
 *
 * 排序键是 `lastUsedAt`（**你点开/切到它的时刻**，`stores/sessions.ts` 维护），不是 `modifiedAt`。
 * 这不是细节：`modifiedAt` 是「最后一次有输出」，后台跑着的 agent 会让它不停往前顶 ——
 * 列表正好在用户要点的瞬间重排。用户最近碰过的，才是他要来回切的。
 */

/** 固定条数。不要做成配置项，也不要改成「加载更多」——那会把跳板变成列表 */
export const RECENT_LIMIT = 8;

export type RecentSession = {
	session: SessionMeta;
	/**
	 * 项目标签：跨项目并排时用来区分同名会话（极淡，不参与排序）。
	 * 日常空间 → `dailyLabel`（调用方传 i18n 文案）；无 cwd 末级名 → null（不渲染标签）。
	 */
	projectLabel: string | null;
};

/**
 * 该行该不该画项目标签、画什么。
 *
 * 行标题在没有会话名时会回落到 cwd 末级名（`sessionTitle`），「最近」每行尾又要一个项目标签，
 * 两者会重复成「percho … percho」。所以标题已经是项目名时返回 null，调用方据此跳过标签。
 */
export function recentProjectLabel(session: SessionMeta, dailyLabel: string): string | null {
	const label = isDailyCwd(session.cwd) ? dailyLabel : pathLastSegment(session.cwd);
	if (!label) return null;
	// 无名会话的标题就是项目名本身，尾部再标一次是纯噪声
	return session.name ? label : null;
}

/**
 * 挑出「最近」行。
 *
 * - `sessions` 传**导航主会话集合**（目录 ∪ 内存，调用方已过 `isPrimaryNavigationSession`）：
 *   被内存策略卸载的会话 `lastUsedAt` 仍在，不会因为卸载就从「最近」里消失。
 * - 只留 `lastUsedAt` 有记录的：从没在这台机器这次进程里打开过的历史会话不参与 —— 那是「历史」，不是「最近」。
 * - `labelOf` 由渲染层注入（cwd 末级名 / 日常文案），纯函数层不产出用户可见中文（与 `sidebar-groups.ts`
 *   的 `label: string | null` 同一纪律）。
 */
export function deriveRecentSessions(
	sessions: readonly SessionMeta[],
	lastUsedAt: Readonly<Record<string, number>>,
	labelOf: (session: SessionMeta) => string | null,
	limit: number = RECENT_LIMIT,
): RecentSession[] {
	if (limit <= 0) return [];
	return sessions
		.filter((session) => typeof lastUsedAt[session.sessionId] === "number")
		.sort((a, b) => (lastUsedAt[b.sessionId] ?? 0) - (lastUsedAt[a.sessionId] ?? 0))
		.slice(0, limit)
		.map((session) => ({ session, projectLabel: labelOf(session) }));
}
