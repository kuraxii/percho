/**
 * 「最近」列表的**停留计时**（纯逻辑，不依赖 React）。
 *
 * 为什么不是「点开就记」：左栏点行是浏览动作，连点五六行扫一遍就会把整份「最近」翻新，
 * 8 个格子全变成刚扫过、但根本没在用的会话 —— 正好毁掉它「我刚碰过的那几个」的用途。
 * 反过来「发消息就记」（`stores/sessions.ts` 的 `noteActiveSessionRecent`）不受这个延迟约束：
 * 那是真实使用，立刻顶到最前。
 *
 * 这里只负责「停够这么久才回调一次」；谁算合法记录对象（排除日常空间/只读检视会话）由调用方的
 * 判据负责（`isRecentCandidate`，与渲染侧共用）。
 */
export const RECENT_DWELL_MS = 10_000;

/**
 * 开始一段停留计时，返回清理函数（切走/卸载时调用，**必须**调：它同时是「不重复记」的保证）。
 *
 * `onElapsed` 接收 `sessionId` 而不是闭包里读全局状态：调用方可能已经切走，
 * 传参让回调能自证「这段计时属于哪个会话」。
 */
export function startDwellTimer(
	sessionId: string,
	onElapsed: (sessionId: string) => void,
	ms: number = RECENT_DWELL_MS,
): () => void {
	const timer = setTimeout(() => onElapsed(sessionId), ms);
	return () => clearTimeout(timer);
}
