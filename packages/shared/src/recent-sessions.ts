/**
 * 「最近」列表的契约（单一事实源）：固定条数 + 把某个会话顶到最前的纯函数。
 *
 * 三处共用同一份，避免各写一份常量后漂移：
 * - renderer 派生（`lib/recent-sessions.ts` 取前 N 条渲染）
 * - renderer store（`noteRecentSession` 顶到最前并裁剪）
 * - main 归一化（`ui-state.ts` 读回时同样裁剪，脏文件不会越用越长）
 *
 * 「最近」是**用户意图的顺序**（你点开/切到它的先后），不是 `modifiedAt`。
 * 这里只负责顺序与上限，不判断成员资格（日常会话排除、已删除/未加载的不渲染都在 renderer 派生层）。
 */

/** 固定条数。不要做成配置项，也不要改成「加载更多」——那会把跳板变成列表 */
export const RECENT_SESSION_LIMIT = 8;

/**
 * 把 `sessionId` 顶到最前（已存在则移过来，不重复）并裁到 `limit` 条。
 * 返回新数组；输入不变（持久化侧拿它整份写回）。
 */
export function pushRecentSession(
	existing: readonly string[],
	sessionId: string,
	limit: number = RECENT_SESSION_LIMIT,
): string[] {
	if (sessionId === "") return [...existing];
	const next = [sessionId, ...existing.filter((id) => id !== sessionId)];
	return limit > 0 ? next.slice(0, limit) : [];
}

/** 从「最近」里移除（删除会话时清，避免留下点不开的残留 id）；不在表里就原样返回 */
export function removeRecentSession(existing: readonly string[], sessionId: string): string[] {
	return existing.filter((id) => id !== sessionId);
}
