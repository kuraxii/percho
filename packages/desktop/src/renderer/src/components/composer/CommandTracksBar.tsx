import { useEffect } from "react";
import { useT } from "../../i18n";
import { type CommandTrack, useCommandTracksStore } from "../../stores/command-tracks";
import { CheckIcon, CloseIcon, ErrorCircleIcon, TodoSpinnerIcon } from "../icons";

/** done/error 槽保留时长（之后自动收起） */
const DONE_VISIBLE_MS = 3000;

/**
 * 命令跟踪槽条（扩展命令悬浮跟踪）：命令零事件（无 agent_start/agent_settled，
 * 执行过程对渲染端不可见），只能靠 prompt 受理回执驱动三态——
 * running（已发送未回执）→ done（handled：扩展命令已就地执行）→ 自动收起；
 * error（prompt 拒绝）；started/queued 回执 = 正常轮次，槽在发送端直接移除。
 * 仿 QueueBar 悬浮卡；done/error 保留几秒，running 等回执不自动关。
 */
export function CommandTracksBar({ tracks, sessionId }: { tracks: CommandTrack[]; sessionId: string }) {
	const t = useT();
	// done/error 槽自动收起；running 等回执（会话清理由 store clearForSession 负责）
	useEffect(() => {
		const timers = tracks
			.filter((track) => track.status !== "running")
			.map((track) =>
				setTimeout(() => {
					useCommandTracksStore.getState().removeTrack(sessionId, track.id);
				}, DONE_VISIBLE_MS),
			);
		return () => timers.forEach(clearTimeout);
	}, [tracks, sessionId]);

	if (tracks.length === 0) return null;

	return (
		<div className="mb-1.5 flex flex-col gap-1.5">
			{tracks.map((track) => {
				const isRunning = track.status === "running";
				return (
					<div
						key={track.id}
						className="group/track relative flex items-center gap-2 overflow-hidden rounded-xl bg-surface px-3 py-1.5 shadow-soft"
					>
						{isRunning ? (
							<TodoSpinnerIcon size={14} className="shrink-0 text-accent" />
						) : track.status === "done" ? (
							<CheckIcon size={14} className="shrink-0 text-ink-faint" />
						) : (
							<ErrorCircleIcon size={14} className="shrink-0 text-red-600" />
						)}
						<span className="shrink-0 text-ui-12 text-ink-faint">/</span>
						<span className="min-w-0 flex-1 truncate text-ui-13 text-ink-2">
							{track.name}
							{track.args ? ` ${track.args}` : ""}
						</span>
						<span
							className={
								track.status === "error"
									? "shrink-0 text-ui-12 text-red-600"
									: "shrink-0 text-ui-12 text-ink-faint"
							}
						>
							{t(
								isRunning
									? "composer.commandRunning"
									: track.status === "done"
										? "composer.commandDone"
										: "composer.commandError",
							)}
						</span>
						{!isRunning && (
							<button
								type="button"
								className="shrink-0 rounded p-0.5 text-ink-faint transition-colors hover:text-ink-2"
								aria-label={t("composer.commandDismiss")}
								onClick={() => useCommandTracksStore.getState().removeTrack(sessionId, track.id)}
							>
								<CloseIcon size={14} />
							</button>
						)}
					</div>
				);
			})}
		</div>
	);
}
