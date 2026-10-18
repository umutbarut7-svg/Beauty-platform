import { describe, expect, it, vi } from "vitest";
import { ToolExecutor } from "./tool-executor.service.js";
import type { AgentTool } from "./agent.types.js";
const context = {
  businessId: "b",
  sessionId: "s",
  user: { id: "u", email: "u@x.test", role: "CUSTOMER" as const },
};
const base: AgentTool = {
  name: "test.read",
  description: "",
  category: "test",
  version: "1",
  permission: "read",
  operationType: "READ",
  requiresConfirmation: false,
  timeoutMs: 5,
  enabled: true,
  inputKeys: [],
  execute: async () => ({ ok: true }),
};
describe("tool executor", () => {
  it("records successful executions and metrics", async () => {
    const create = vi.fn();
    const metric = vi.fn();
    const executor = new ToolExecutor(
      { agentToolExecution: { create } } as never,
      { agentTool: metric } as never,
    );
    await expect(executor.execute(base, {}, context)).resolves.toEqual({
      ok: true,
    });
    expect(create).toHaveBeenCalled();
    expect(metric).toHaveBeenCalledWith(true);
  });
  it("bounds tool execution time", async () => {
    const executor = new ToolExecutor(
      { agentToolExecution: { create: vi.fn() } } as never,
      { agentTool: vi.fn() } as never,
    );
    await expect(
      executor.execute(
        { ...base, execute: () => new Promise(() => {}) },
        {},
        context,
      ),
    ).rejects.toThrow("timed out");
  });
});
