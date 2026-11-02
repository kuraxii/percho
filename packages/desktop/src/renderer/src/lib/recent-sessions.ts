import { RECENT_SESSION_LIMIT, type SessionMeta } from "@percho/shared";
import { isDailyCwd } from "./daily";
import { pathLastSegment } from "./path-display";
import { isPrimaryNavigationSession } from "./session-visibility";

/**
 * 左栏「最近」列表的纯派生层：跨项目挑出**最近被你打开或交互过**的会话，固定 `RECENT_LIMIT` 条。
 *
 * 它接替了顶栏的会话 tab（临时工作区）。差别是刻意的，也是这套设计能站住的原因：
 * - **不占横向空间**、不需要手动关、不会泛滥 —— 没有「成员表」这回事，全由这份派生算出来；
 * - **跨项目**：不按 cwd 过滤。要找的是「刚才那个会话」，不该先展开项目再翻；
 * - **固定条数、不滚动**：它只是跳板，不是第二个完整列表；全量去下面的项目分组或搜索。
 *
 * 排序键是落盘的 `recentSessions`（**你点开/切到它的时刻**的顺序，见 `stores/ui-preferences.ts`），不是 `modifiedAt`。
 * 这不是细节：`modifiedAt` 是「最后一次有输出」，后台跑着的 agent 会让它不停往前顶 ——
 * 列表正好在用户要点的瞬间重排。用户最近碰过的，才是他要来回切的。
 */

/**
 * 固定条数（契约在 `@percho/shared/recent-sessions`：main 归一化、store 顶到最前、这里渲染取前三处共用一份）。
 * 不要做成配置项，也不要改成「加载更多」——那会把跳板变成列表。
 */
export const RECENT_LIMIT = RECENT_SESSION_LIMIT;

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
 * 这个会话该不该进「最近」—— **记录与渲染两头共用这一条判据**，避免写入侧和派生侧各写一份规则后漂移。
 *
 * - 日常空间的会话排除：日常是随手问几句的草稿区，塞进「最近」会挤掉真正在项目里来回切的位子。
 *   渲染时过滤还不够：记录是“顶到最前 + 裁到 8 条”，日常会话记进去就已经把项目会话挤掉了。
 * - 只读子代理检视会话排除：它是检视视图，不是用户的工作会话（与导航可见集合同一判据）。
 */
export function isRecentCandidate(session: SessionMeta): boolean {
	return isPrimaryNavigationSession(session) && !isDailyCwd(session.cwd);
}

/**
 * 挑出「最近」行。
 *
 * - `sessions` 传**导航主会话集合**（目录 ∪ 内存，调用方已过 `isPrimaryNavigationSession`）：
 *   被内存策略卸载的会话仍能出现（行只靠 meta，不需要打开）。
 * - `recentIds` 是落盘的顺序（最近在前）；**不在表里的会话不出现**。
 * - 已删除的会话 id 自然不在 `sessions` 里 → 被过滤掉（写侧还会主动清表，这里是双保险）。
 * - `excludeCwd` 传日常目录（**日常空间的会话一律排除**，用户明确要求）：写入侧已挡（`isRecentCandidate`），
 *   这里再挡一次是给旧文件兜底——早期落盘的 id 可能含日常会话。
 * - `labelOf` 由渲染层注入（cwd 末级名 / 日常文案），纯函数层不产出用户可见中文（与 `sidebar-groups.ts`
 *   的 `label: string | null` 同一纪律）。
 */
export function deriveRecentSessions(
	sessions: readonly SessionMeta[],
	recentIds: readonly string[],
	labelOf: (session: SessionMeta) => string | null,
	limit: number = RECENT_LIMIT,
	options: { excludeCwd?: (cwd: string) => boolean } = {},
): RecentSession[] {
	if (limit <= 0) return [];
	const excluded = options.excludeCwd ?? (() => false);
	// 按 `recentIds` 的顺序走（而不是给 sessions 排序）：顺序是落盘的用户意图，sessions 只是成员表
	const byId = new Map(sessions.map((session) => [session.sessionId, session]));
	const out: RecentSession[] = [];
	for (const id of recentIds) {
		const session = byId.get(id);
		if (!session) continue;
		if (excluded(session.cwd)) continue;
		out.push({ session, projectLabel: labelOf(session) });
		if (out.length >= limit) break;
	}
	return out;
}
