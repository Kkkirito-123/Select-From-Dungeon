/** 跟踪 Q+S 组合键，避免单个按键直接打开 SQL 终端。 */
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
