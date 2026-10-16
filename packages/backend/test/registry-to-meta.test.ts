import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import type { RegisteredSession } from "../src/session/registry";
import { SessionRegistry } from "../src/session/registry";

/**
 * 构造最小 registry entry（stub session 直入私有 registry，同 session-tree-operations 手法）。
 * toMeta 需要：sessionManager.getHeader()/getEntries()、sessionName/model/thinkingLevel/messages、
 * sessionFile、entry.cwd/readOnly。
 */
function makeEntry(overrides: { cwd?: string; parentSession?: string } = {}): RegisteredSession {
	const header: { timestamp: string; parentSession?: string } = {
		timestamp: "2026-01-01T00:00:00.000Z",
	};
	if (overrides.parentSession !== undefined) header.parentSession = overrides.parentSession;
	const session = {
		sessionId: "s1",
		sessionName: "测试",
		sessionFile: "/tmp/sessions/s1.jsonl",
		model: null,
		thinkingLevel: undefined,
		messages: [],
		sessionManager: {
			getHeader: () => header,
			getEntries: () => [],
		},
	} as unknown as AgentSession;
	return {
		session,
		unsubscribe: () => {},
		cwd: overrides.cwd ?? "/tmp/project",
		gate: { dispose: () => {} },
		dialogs: { dispose: () => {} },
		modeRef: { value: "default" },
	} as unknown as RegisteredSession;
}

describe("SessionRegistry.toMeta（会话血缘字段透传）", () => {
	it("fork 会话：parentSessionPath 取自 header.parentSession（头字段权威）", () => {
		const registry = new SessionRegistry();
		const meta = registry.toMeta(
			makeEntry({ cwd: "/tmp/project", parentSession: "/tmp/sessions/root.jsonl" }),
		);
		expect(meta.parentSessionPath).toBe("/tmp/sessions/root.jsonl");
	});

	it("根会话：header 无 parentSession → parentSessionPath 为 undefined", () => {
		const registry = new SessionRegistry();
		const meta = registry.toMeta(makeEntry({ cwd: "/tmp/project" }));
		expect(meta.parentSessionPath).toBeUndefined();
	});

	it("cwd 原样透传（归一化责任在 createSession/openSession 对齐处）", () => {
		const registry = new SessionRegistry();
		const meta = registry.toMeta(makeEntry({ cwd: "/tmp/project" }));
		expect(meta.cwd).toBe("/tmp/project");
	});
});
