import { create } from "zustand";

/** chip → 侧栏跳转目标（nonce 保证重复跳同文件也重触发） */
export interface DiffFocus {
	/** 目标文件卡的首个 section key（TurnFileChange.sections[0].toolCallKey） */
	sectionKey: string;
	nonce: number;
}

interface UiStore {
	/** todo 面板展开态（按会话，切换会话互不影响；不含持久化） */
	todoExpanded: Record<string, boolean>;
	toggleTodoExpanded: (sessionId: string) => void;
	/** diff 侧栏开关（内存态，不持久化——重启统一关闭，用户已定） */
	diffSidebarOpen: boolean;
	setDiffSidebarOpen: (open: boolean) => void;
	toggleDiffSidebar: () => void;
	/** chip 跳转侧栏的聚焦目标（侧栏消费后清除） */
	diffFocus: DiffFocus | null;
	setDiffFocus: (sectionKey: string) => void;
	clearDiffFocus: () => void;
	/** diff 侧栏宽度（内存态，与开关一致不落盘；拖拽左缘调整，默认 420，范围 [320, maxWidth]） */
	diffSidebarWidth: number;
	setDiffSidebarWidth: (width: number, maxWidth?: number) => void;
}

/** diff 侧栏宽度钳制（非有限数回落默认 420；maxWidth 缺省 720——拖拽上限由调用方传「侧栏右边界」动态值） */
export function clampDiffSidebarWidth(value: number, maxWidth = 720): number {
	if (!Number.isFinite(value)) return 420;
	return Math.min(maxWidth, Math.max(320, Math.round(value)));
}

/** 界面态里只放「不跨会话、不落盘」的瞬时开关；持久化偏好一律走 ui-preferences */
export const useUiStore = create<UiStore>((set) => ({
	todoExpanded: {},
	toggleTodoExpanded: (sessionId) =>
		set((state) => ({
			todoExpanded: { ...state.todoExpanded, [sessionId]: !state.todoExpanded[sessionId] },
		})),
	diffSidebarOpen: false,
	setDiffSidebarOpen: (open) => set({ diffSidebarOpen: open }),
	toggleDiffSidebar: () => set((state) => ({ diffSidebarOpen: !state.diffSidebarOpen })),
	diffFocus: null,
	setDiffFocus: (sectionKey) =>
		set((state) => ({ diffFocus: { sectionKey, nonce: (state.diffFocus?.nonce ?? 0) + 1 } })),
	clearDiffFocus: () => set({ diffFocus: null }),
	diffSidebarWidth: 420,
	setDiffSidebarWidth: (width, maxWidth = 720) =>
		set({ diffSidebarWidth: clampDiffSidebarWidth(width, maxWidth) }),
}));
