import { create } from "zustand";

/**
 * 扩展命令跟踪槽（命令悬浮条数据源）：
 * 发送端在「斜杠且非 Percho 内置命令」时乐观插入 running 槽；prompt 受理回执
 * （IPC prompt 返回的 disposition）驱动状态流转——"handled" = 扩展命令已就地执行
 * （本轮无模型轮次）→ done；"started"/"queued" = 模板/skill/正常轮次 → 槽移除。
 * 独立 store、不依赖 transcripts/sessions：命令并发时按槽位 id 各自独立。
 */
export type CommandTrackStatus = "running" | "done" | "error";

export interface CommandTrack {
	/** 槽位 id（发送时生成：时间戳+随机后缀），同会话多命令并发时区分 */
	id: string;
	/** 命令名（不带斜杠；/name-sessions → "name-sessions"） */
	name: string;
	/** 命令名后的剩余文本（参数），无参数为空串 */
	args: string;
	status: CommandTrackStatus;
}

/** 空列表稳定引用（selector 缺省用，禁内联新数组，防无限渲染循环） */
export const EMPTY_COMMAND_TRACKS: CommandTrack[] = [];

export interface CommandTracksStore {
	bySession: Record<string, CommandTrack[]>;
	/** 乐观插入跟踪槽（发送扩展命令候选时） */
	addTrack: (sessionId: string, track: CommandTrack) => void;
	/** 按槽位 id 更新状态（幂等：槽不存在时忽略） */
	updateTrack: (sessionId: string, id: string, status: CommandTrackStatus) => void;
	/** 移除槽（started/queued 回执 = 正常轮次由轮次状态接管，槽关闭） */
	removeTrack: (sessionId: string, id: string) => void;
	/** 会话切换/关闭时清理（防跨会话残留） */
	clearForSession: (sessionId: string) => void;
}

export const useCommandTracksStore = create<CommandTracksStore>((set) => ({
	bySession: {},
	addTrack: (sessionId, track) =>
		set((state) => {
			const current = state.bySession[sessionId];
			const next = current ? [...current, track] : [track];
			return { bySession: { ...state.bySession, [sessionId]: next } };
		}),
	updateTrack: (sessionId, id, status) =>
		set((state) => {
			const current = state.bySession[sessionId];
			if (!current) return state;
			return {
				bySession: {
					...state.bySession,
					[sessionId]: current.map((track) => (track.id === id ? { ...track, status } : track)),
				},
			};
		}),
	removeTrack: (sessionId, id) =>
		set((state) => {
			const current = state.bySession[sessionId];
			if (!current) return state;
			const next = current.filter((track) => track.id !== id);
			return {
				bySession: {
					...state.bySession,
					[sessionId]: next,
				},
			};
		}),
	clearForSession: (sessionId) =>
		set((state) => {
			if (!state.bySession[sessionId]) return state;
			const next = { ...state.bySession };
			delete next[sessionId];
			return { bySession: next };
		}),
}));

/** selector 辅助：返回某会话的跟踪槽（无则共享空数组常量，引用稳定） */
export function selectCommandTracks(state: CommandTracksStore, sessionId: string | null): CommandTrack[] {
	return sessionId ? (state.bySession[sessionId] ?? EMPTY_COMMAND_TRACKS) : EMPTY_COMMAND_TRACKS;
}
