import type { SessionMeta } from "@percho/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { setDailyDirForTest } from "./daily";
import { deriveRecentSessions, RECENT_LIMIT, recentProjectLabel } from "./recent-sessions";

function meta(overrides: Partial<SessionMeta> = {}): SessionMeta {
	return {
		sessionId: "s1",
		sessionFile: "/sessions/a/s1.jsonl",
		cwd: "/home/zjzhu/other/percho",
		name: undefined,
		createdAt: 1_000,
		modifiedAt: 1_000,
		...overrides,
	} as SessionMeta;
}

describe("deriveRecentSessions", () => {
	it("按 lastUsedAt 倒序，而不是 modifiedAt（后台 agent 不许重排列表）", () => {
		const stale = meta({ sessionId: "a", modifiedAt: 9_999 });
		const fresh = meta({ sessionId: "b", modifiedAt: 1 });
		const rows = deriveRecentSessions([stale, fresh], { a: 100, b: 900 }, () => null);
		expect(rows.map((r) => r.session.sessionId)).toEqual(["b", "a"]);
	});

	it("跨项目不过滤 cwd：不同目录的会话一起排", () => {
		const a = meta({ sessionId: "a", cwd: "/x/alpha" });
		const b = meta({ sessionId: "b", cwd: "/y/beta" });
		const rows = deriveRecentSessions([a, b], { a: 10, b: 20 }, () => null);
		expect(rows.map((r) => r.session.cwd)).toEqual(["/y/beta", "/x/alpha"]);
	});

	it("只留 lastUsedAt 有记录的（没在这台机器上打开过的历史会话不进「最近」）", () => {
		const never = meta({ sessionId: "never" });
		const used = meta({ sessionId: "used" });
		const rows = deriveRecentSessions([never, used], { used: 5 }, () => null);
		expect(rows.map((r) => r.session.sessionId)).toEqual(["used"]);
	});

	it("固定 RECENT_LIMIT 条：第 9 条起不出现（不滚动、不加载更多）", () => {
		const many = Array.from({ length: 20 }, (_, i) => meta({ sessionId: `s${i}` }));
		const lastUsedAt = Object.fromEntries(many.map((s, i) => [s.sessionId, i]));
		const rows = deriveRecentSessions(many, lastUsedAt, () => null);
		expect(RECENT_LIMIT).toBe(8);
		expect(rows).toHaveLength(8);
		// 最新的 8 条（19..12），从新到旧
		expect(rows.map((r) => r.session.sessionId)).toEqual([
			"s19",
			"s18",
			"s17",
			"s16",
			"s15",
			"s14",
			"s13",
			"s12",
		]);
	});

	it("limit=0 返回空（防御，调用方不该传 0）", () => {
		expect(deriveRecentSessions([meta()], { s1: 1 }, () => null, 0)).toEqual([]);
	});

	it("同样的 lastUsedAt 不抖动：顺序由输入决定（sort 稳定）", () => {
		const a = meta({ sessionId: "a" });
		const b = meta({ sessionId: "b" });
		const rows = deriveRecentSessions([a, b], { a: 7, b: 7 }, () => null);
		expect(rows.map((r) => r.session.sessionId)).toEqual(["a", "b"]);
	});

	it("labelOf 注入的项目标签原样透传", () => {
		const rows = deriveRecentSessions([meta({ sessionId: "a" })], { a: 1 }, () => "percho");
		expect(rows[0]?.projectLabel).toBe("percho");
	});
});

describe("recentProjectLabel", () => {
	beforeAll(() => setDailyDirForTest("/home/zjzhu/.percho/daily"));
	it("有名会话 → 给项目名（区分跨项目同名会话）", () => {
		expect(recentProjectLabel(meta({ name: "修终端拖拽", cwd: "/home/zjzhu/other/percho" }), "日常")).toBe(
			"percho",
		);
	});

	it("无名会话 → null（标题已回落到项目名，尾部再标一次是噪声）", () => {
		expect(recentProjectLabel(meta({ name: undefined, cwd: "/home/zjzhu/other/percho" }), "日常")).toBeNull();
	});

	it("日常空间用调用方给的 i18n 文案", () => {
		expect(recentProjectLabel(meta({ name: "聊聊", cwd: "/home/zjzhu/.percho/daily" }), "日常")).toBe("日常");
	});

	it("cwd 是根路径（无末级名）→ null", () => {
		expect(recentProjectLabel(meta({ name: "x", cwd: "/" }), "日常")).toBeNull();
	});
});
