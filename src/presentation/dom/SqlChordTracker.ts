/** SQL 终端快捷键组合的输入状态机，不处理查询和游戏状态。 */
export class SqlChordTracker {
  private qDown = false;
  private sDown = false;

  keyDown(code: string): boolean {
    if (code === "KeyQ") this.qDown = true;
    if (code === "KeyS") this.sDown = true;
    return this.qDown && this.sDown;
  }

  keyUp(code: string): void {
    if (code === "KeyQ") this.qDown = false;
    if (code === "KeyS") this.sDown = false;
  }

  reset(): void {
    this.qDown = false;
    this.sDown = false;
  }
}
