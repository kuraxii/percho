import { useEffect } from "react";
import { useSessionsStore } from "../stores/sessions";
import { useUiPreferencesStore } from "../stores/ui-preferences";
import { startDwellTimer } from "./recent-session-dwell";
import { isRecentCandidate } from "./recent-sessions";

/**
 * 「最近」列表的停留计时接线层：切到某个会话后停够 `RECENT_DWELL_MS` 才记一笔。
 *
 * 计时对象是**活动会话 id**：切走立即作废（cleanup 清定时器），所以快速扫过不会累积；
 * 同一会话反复进入每次重新计时（中途走开过就不算连续停留）。
 * `activeSessionId === null`（新会话页）不存在“停留”，draft 转正后会以新 id 重新计时。
 *
 * 判定与计时都在 `lib/recent-session-dwell.ts`，这里只订阅 id 与到点后写 store。
 * 依赖方向：lib → stores（与 `use-session-gc` 同向），不引入环。
 */
export function useRecentSessionDwell(): void {
	const activeSessionId = useSessionsStore((s) => s.activeSessionId);
	useEffect(() => {
		if (!activeSessionId) return;
		return startDwellTimer(activeSessionId, (sessionId) => {
			// 判据与渲染侧共用 `isRecentCandidate`：日常空间与只读检视会话不进「最近」
			const session = useSessionsStore.getState().sessions.find((s) => s.sessionId === sessionId);
			if (!session || !isRecentCandidate(session)) return;
			useUiPreferencesStore.getState().noteRecentSession(sessionId);
		});
	}, [activeSessionId]);
}
