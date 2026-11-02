import { describe, expect, it, vi } from "vitest";
import { RECENT_DWELL_MS, startDwellTimer } from "./recent-session-dwell";

/**
 * 停留计时（「最近」列表的写入策略）：停够 10s 才记，切走立即作废。
 * 纯逻辑层：用假定时器验证「不扫过就记」与「清理后不再回调」两条关键语义。
 */
describe("startDwellTimer", () => {
	it("停够时长才回调，回调带上计时所属的 sessionId", () => {
		vi.useFakeTimers();
		const seen: string[] = [];
		startDwellTimer("s1", (id) => seen.push(id));

		vi.advanceTimersByTime(RECENT_DWELL_MS - 1);
		expect(seen).toEqual([]); // 还没到

		vi.advanceTimersByTime(1);
		expect(seen).toEqual(["s1"]);
		vi.useRealTimers();
	});

	it("默认时长是 10 秒（连点侧栏扫过去不会被记成「最近」）", () => {
		expect(RECENT_DWELL_MS).toBe(10_000);
	});

	it("清理后不再回调（切走就作废：快速扫过不会累积记录）", () => {
		vi.useFakeTimers();
		const seen: string[] = [];
		const stop = startDwellTimer("s1", (id) => seen.push(id));
		vi.advanceTimersByTime(RECENT_DWELL_MS - 1);
		stop();
		vi.advanceTimersByTime(60_000);
		expect(seen).toEqual([]);
		vi.useRealTimers();
	});

	it("同一会话重新进入 = 重新计时（中途走开过不算连续停留）", () => {
		vi.useFakeTimers();
		const seen: string[] = [];
		const stop1 = startDwellTimer("s1", (id) => seen.push(id));
		vi.advanceTimersByTime(RECENT_DWELL_MS - 1);
		stop1(); // 切走
		const stop2 = startDwellTimer("s1", (id) => seen.push(id)); // 又切回来

		vi.advanceTimersByTime(RECENT_DWELL_MS - 1);
		expect(seen).toEqual([]); // 第一段不算数
		vi.advanceTimersByTime(1);
		expect(seen).toEqual(["s1"]); // 第二段满时长
		stop2();
		vi.useRealTimers();
	});

	it("可自定义时长（测试/未来调参不改调用方）", () => {
		vi.useFakeTimers();
		const seen: string[] = [];
		startDwellTimer("s1", (id) => seen.push(id), 500);
		vi.advanceTimersByTime(500);
		expect(seen).toEqual(["s1"]);
		vi.useRealTimers();
	});
});
