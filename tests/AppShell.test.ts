import { describe, expect, it } from "vitest";
import { canOpenCombatTerminal } from "../src/ui/AppShell";

describe("canOpenCombatTerminal", () => {
  it("只在战斗且没有回合结算时允许打开终端", () => {
    expect(canOpenCombatTerminal("combat", false)).toBe(true);
    expect(canOpenCombatTerminal("combat", true)).toBe(false);
    expect(canOpenCombatTerminal("explore", false)).toBe(false);
    expect(canOpenCombatTerminal(undefined, false)).toBe(false);
  });
});
