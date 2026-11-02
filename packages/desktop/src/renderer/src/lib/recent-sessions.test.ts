import {
	pushRecentSession,
	RECENT_SESSION_LIMIT,
	removeRecentSession,
	type SessionMeta,
} from "@percho/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { setDailyDirForTest } from "./daily";
import { deriveRecentSessions, isRecentCandidate, RECENT_LIMIT, recentProjectLabel } from "./recent-sessions";

const DAILY = "/home/zjzhu/.percho/daily";

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
	it("顺序由落盘的 recentIds 决定，不看 modifiedAt（后台 agent 不许重排列表）", () => {
		const stale = meta({ sessionId: "a", modifiedAt: 9_999 });
		const fresh = meta({ sessionId: "b", modifiedAt: 1 });
		const rows = deriveRecentSessions([stale, fresh], ["a", "b"], () => null);
		expect(rows.map((r) => r.session.sessionId)).toEqual(["a", "b"]);
	});

	it("跨项目不过滤 cwd：不同目录的会话一起排", () => {
		const a = meta({ sessionId: "a", cwd: "/x/alpha" });
		const b = meta({ sessionId: "b", cwd: "/y/beta" });
		const rows = deriveRecentSessions([a, b], ["a", "b"], () => null);
		expect(rows.map((r) => r.session.cwd)).toEqual(["/x/alpha", "/y/beta"]);
	});

	it("不在 recentIds 里的会话不出现（没打开过 = 历史，不是最近）", () => {
		const never = meta({ sessionId: "never" });
		const used = meta({ sessionId: "used" });
		const rows = deriveRecentSessions([never, used], ["used"], () => null);
		expect(rows.map((r) => r.session.sessionId)).toEqual(["used"]);
	});

	it("已在表里但会话不存在（删了/目录没刷到）→ 跳过而不是占位", () => {
		const rows = deriveRecentSessions([meta({ sessionId: "alive" })], ["ghost", "alive"], () => null);
		expect(rows.map((r) => r.session.sessionId)).toEqual(["alive"]);
	});

	it("固定 RECENT_LIMIT 条：第 9 条起不出现（不滚动、不加载更多）", () => {
		const many = Array.from({ length: 20 }, (_, i) => meta({ sessionId: `s${i}` }));
		// recentIds 已是「最近在前」的顺序，这里直接给正序名单
		const rows = deriveRecentSessions(
			many,
			many.map((s) => s.sessionId),
			() => null,
		);
		expect(RECENT_LIMIT).toBe(8);
		expect(rows).toHaveLength(8);
		expect(rows.map((r) => r.session.sessionId)).toEqual(["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7"]);
	});

	it("limit=0 返回空（防御，调用方不该传 0）", () => {
		expect(deriveRecentSessions([meta()], ["s1"], () => null, 0)).toEqual([]);
	});

	it("excludeCwd 排除日常空间的会话（旧文件里可能残留日常 id）", () => {
		const daily = meta({ sessionId: "daily1", cwd: DAILY });
		const project = meta({ sessionId: "p1" });
		const rows = deriveRecentSessions([daily, project], ["daily1", "p1"], () => null, RECENT_LIMIT, {
			excludeCwd: (cwd) => cwd === DAILY,
		});
		expect(rows.map((r) => r.session.sessionId)).toEqual(["p1"]);
	});

	it("labelOf 注入的项目标签原样透传", () => {
		const rows = deriveRecentSessions([meta({ sessionId: "a" })], ["a"], () => "percho");
		expect(rows[0]?.projectLabel).toBe("percho");
	});
});

describe("isRecentCandidate", () => {
	beforeAll(() => setDailyDirForTest(DAILY));

	it("项目会话进表", () => {
		expect(isRecentCandidate(meta({ cwd: "/home/zjzhu/other/percho" }))).toBe(true);
	});

	it("日常会话不进表（写入侧就挡，不能靠渲染时过滤——顶到最前时已经把项目位子挤掉了）", () => {
		expect(isRecentCandidate(meta({ cwd: DAILY }))).toBe(false);
	});

	it("只读子代理检视会话不进表", () => {
		expect(isRecentCandidate(meta({ cwd: "/home/zjzhu/other/percho", readOnly: true }))).toBe(false);
	});
});

describe("recentProjectLabel", () => {
	beforeAll(() => setDailyDirForTest(DAILY));
	it("有名会话 → 给项目名（区分跨项目同名会话）", () => {
		expect(recentProjectLabel(meta({ name: "修终端拖拽", cwd: "/home/zjzhu/other/percho" }), "日常")).toBe(
			"percho",
		);
	});

	it("无名会话 → null（标题已回落到项目名，尾部再标一次是噪声）", () => {
		expect(recentProjectLabel(meta({ name: undefined, cwd: "/home/zjzhu/other/percho" }), "日常")).toBeNull();
	});

	it("日常空间用调用方给的 i18n 文案", () => {
		expect(recentProjectLabel(meta({ name: "聊聊", cwd: DAILY }), "日常")).toBe("日常");
	});

	it("cwd 是根路径（无末级名）→ null", () => {
		expect(recentProjectLabel(meta({ name: "x", cwd: "/" }), "日常")).toBeNull();
	});
});

describe("pushRecentSession / removeRecentSession（落盘顺序的纯函数）", () => {
	it("顶到最前，已存在则移动而不是重复", () => {
		expect(pushRecentSession(["a", "b", "c"], "c")).toEqual(["c", "a", "b"]);
	});

	it("新 id 插到最前", () => {
		expect(pushRecentSession(["a", "b"], "z")).toEqual(["z", "a", "b"]);
	});

	it("超出上限时裁掉最旧的", () => {
		const full = Array.from({ length: RECENT_SESSION_LIMIT }, (_, i) => `s${i}`);
		const next = pushRecentSession(full, "new");
		expect(next).toHaveLength(RECENT_SESSION_LIMIT);
		expect(next[0]).toBe("new");
		expect(next).not.toContain(`s${RECENT_SESSION_LIMIT - 1}`);
	});

	it("空 id 原样返回（不往表里塞空串）", () => {
		expect(pushRecentSession(["a"], "")).toEqual(["a"]);
	});

	it("removeRecentSession 移除已存在的 id", () => {
		expect(removeRecentSession(["a", "b"], "a")).toEqual(["b"]);
	});

	it("removeRecentSession 对不在表里的 id 原样返回（调用方据此短路，不写盘）", () => {
		const same = ["a", "b"];
		expect(removeRecentSession(same, "zzz")).toEqual(same);
	});
});
