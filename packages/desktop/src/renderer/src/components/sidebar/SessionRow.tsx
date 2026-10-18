import type { SessionMeta } from "@percho/shared";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useT } from "../../i18n";
import { PinIcon } from "../icons";
import type { RowGuide } from "../../lib/sidebar-groups";
import { sessionTitle, useSessionStatus } from "../session/session-status";
import type { MenuAnchor } from "../ui/place-menu";

/** 行树形指引线：单层 background 多段线性渐变（保留 RowGuide 结构 + 行距 2px 断点）。
 *  - 用 CSS 渐变而非 1px span：background 图块整体亚像素圆整，非整数缩放（125%/150%/2.2×）下
 *    所有线段粗细一致（独立 span 各行亚像素相位不同，会出现 hairline 粗细不一）；
 *  - 每段只覆盖本行 34px 盒子，行间 2px 空隙（行外层 mb-[2px]）处自然断开；
 *  - 最后子的本层竖线只到箭头处（17px），非最后子贯穿整行；横线 y=16px（箭头垂直中线）；
 *  - `z-[1]` 压在行按钮的选中/hover 底色之上（设计稿：线画在高亮底色上面）。 */
function TreeGuide({ guide }: { guide: RowGuide }) {
	const color = "var(--color-tree-line)";
	const stops: string[] = [];
	for (const x of guide.trunks) {
		stops.push(`linear-gradient(${color}, ${color}) ${x}px 0/1px 100% no-repeat`);
	}
	if (guide.elbow) {
		const { x, last, arm } = guide.elbow;
		stops.push(`linear-gradient(${color}, ${color}) ${x}px 0/1px ${last ? "17px" : "100%"} no-repeat`);
		stops.push(`linear-gradient(${color}, ${color}) ${x}px 16px/${arm}px 1px no-repeat`);
	}
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute inset-0 z-[1]"
			style={{ background: stops.join(", ") }}
		/>
	);
}

/** 行尾状态点：待审批琥珀（静态）/ 工作中墨色（呼吸，节拍与顶栏头像同一套）/ 完成未读绿；空闲无点。
 *  空字符串 = 不渲染（Tailwind 需要在源码里出现完整类名，不做字符串拼接） */
const DOT_CLASS: Record<string, string> = {
	attention: "bg-amber-500",
	working: "bg-ink sidebar-dot-working",
	done: "bg-green-500",
};

/**
 * 左侧栏会话行：无头像（项目归属已由所在分组表达）、单行文字 + 行尾状态点。
 * 点击 = 打开 / 切换会话（`openSession` 同一条路径）；右键菜单由调用方接线（复用 session-menu）。
 * v6 定稿：字号 13.5px / 行高 31px。
 * 设计稿对齐：行容器 34px，内容胶囊（wrap）absolute left:10+depth*16 / top:2 / h:30——选中/悬停背景只盖胶囊，非整行蒙版。
 * v8：置顶的行在**行首图标槽**里出一枚 12px 图钉（用户：置顶后没任何区分度）。槽位是
 * 固定 16×16（`px-1.5` + 16 + `gap-2` = 30px），所以带不带图钉，标题左缘恒在 30px（与项目名对齐）。
 */
export function SessionRow({
	session,
	active,
	pinned = false,
	depth = 0,
	hasChildren = false,
	collapsed = false,
	subtreeCount = 0,
	guide,
	onSelect,
	onToggleCollapse,
	onContextMenu,
}: {
	session: SessionMeta;
	active: boolean;
	pinned?: boolean;
	/** 血缘层级（根 = 0）：>0 时整行右移（每级 16px）并画出树形指引线 */
	depth?: number;
	/** 有子会话：行首出折叠箭头（置顶区平铺不看父子，不设） */
	hasChildren?: boolean;
	/** 子树当前收起（箭头状态；收起时子树行由派生层不渲染） */
	collapsed?: boolean;
	/** 子树全部后代数：有子且折叠时在行尾显示「+N」徽章（设计稿） */
	subtreeCount?: number;
	/** 树形指引线结构化描述（RowGuide：trunks 祖先贯穿竖线 + elbow 本层连接线；渲染层画真实线段） */
	guide?: RowGuide;
	onSelect: () => void;
	onToggleCollapse?: () => void;
	onContextMenu?: (anchor: MenuAnchor) => void;
}) {
	const t = useT();
	const status = useSessionStatus(session.sessionId);
	const title = sessionTitle(session, t("projects.untitled"), t("projects.daily"));
	return (
		<div className="relative mb-[2px] h-[34px] shrink-0">
			{/* 树形指引线（设计稿：祖先竖线 + 本层竖线 + 横线；z-[1] 压在高亮底色上，-1px 上下延伸盖接缝） */}
			{guide && <TreeGuide guide={guide} />}
			<button
				type="button"
				// 可测试性只读属性（spec §6：CDP 按 sessionId 定位行，而不是靠标题文本匹配；纯属性，不影响视觉/交互）
				data-session-id={session.sessionId}
				data-session-active={active ? "true" : "false"}
				// 设计稿：内容胶囊（wrap）absolute left:10+depth*16 / right:8 / top:2 / h:30，行容器 34px；
				// 选中/悬停背景只盖胶囊（非整行蒙版），圆角 8px，选中加粗 600
				className={`absolute top-[2px] right-2 flex h-[30px] items-center gap-2 rounded-lg px-1 text-left text-ui-135 ${
					active ? "bg-bubble font-semibold text-ink" : "text-ink-2 hover:bg-hover hover:text-ink"
				}`}
				style={{ left: 10 + depth * 16 }}
				onClick={onSelect}
				onContextMenu={
					onContextMenu
						? (e: ReactMouseEvent<HTMLButtonElement>) => {
								e.preventDefault();
								// 锚点 = 指针位置（与悬浮面板行一致的 "在指针处弹出" 语言），零尺寸矩形只用于避让
								onContextMenu({ left: e.clientX, top: e.clientY, width: 0, height: 0 });
							}
						: undefined
				}
			>
				{/* 图标槽：无箭头时放图钉，有箭头时留空占位（标题 x 恒定） */}
				<span className="grid h-4 w-4 shrink-0 place-items-center text-ink-faint" aria-hidden="true">
					{pinned && !hasChildren && <PinIcon size={12} />}
				</span>
				<span className="min-w-0 flex-1 truncate">{title}</span>
				{/* 子节点数量徽章（设计稿：有子且折叠时显示 +N，N=全部后代） */}
				{hasChildren && collapsed && subtreeCount > 0 && (
					<span
						className="shrink-0 rounded-lg px-1.5 text-ui-11 leading-4 text-ink-dim"
						style={{ background: "var(--color-hover)" }}
					>
						+{subtreeCount}
					</span>
				)}
				{status !== "idle" && (
					<span
						className={`mr-0.5 h-[7px] w-[7px] shrink-0 rounded-full ${DOT_CLASS[status]}`}
						aria-hidden="true"
					/>
				)}
			</button>
			{/* 折叠箭头：行的兄弟节点（绝对定位浮在图标槽上），与 ProjectRow 行末按钮同惯例——避免 button 套 button；
			   设计稿：16×16 按钮 + 12px chevron 旋转动画（展开 = 90°），无子时该位置由图标槽占位对齐 */}
			{hasChildren && (
				<button
					type="button"
					aria-label={collapsed ? t("sidebar.expandNode") : t("sidebar.collapseNode")}
					aria-expanded={!collapsed}
					className="absolute top-1/2 grid h-4 w-4 -translate-y-1/2 place-items-center rounded"
					// 设计稿：箭头按钮 16×16 圆角 4px，颜色 #8A867C（固定，无 hover 变深）
					style={{ left: 14 + depth * 16, color: "#8a867c" }}
					onClick={(event) => {
						event.stopPropagation();
						onToggleCollapse?.();
					}}
				>
					<svg
						width="12"
						height="12"
						viewBox="0 0 12 12"
						fill="none"
						stroke="currentColor"
						strokeWidth={1.6}
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden="true"
						className="transition-transform duration-150"
						style={{ transform: `rotate(${collapsed ? 0 : 90}deg)` }}
					>
						{/* 设计稿 chevron（stroke 细线风格）：M4.5 2.5L8 6l-3.5 3.5 */}
						<path d="M4.5 2.5L8 6l-3.5 3.5" />
					</svg>
				</button>
			)}
		</div>
	);
}
