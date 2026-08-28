import type { PresenceState } from "../../../infrastructure/presence/PresenceClient";
import type { AppShellDom } from "../appShellDom";

export class PresencePanel {
  constructor(private readonly dom: Pick<
    AppShellDom,
    "presenceIndicator" | "presenceCount" | "presenceLabel"
  >) {}

  render(state: PresenceState): void {
    this.dom.presenceIndicator.dataset.state = state.status;
    if (state.status === "online") {
      this.dom.presenceCount.textContent = String(state.count);
      this.dom.presenceLabel.textContent = `当前在线 ${state.count} 人`;
      this.dom.presenceIndicator.setAttribute("aria-label", `当前在线 ${state.count} 人`);
      return;
    }

    this.dom.presenceCount.textContent = "—";
    const label = state.status === "connecting" ? "正在连接在线人数服务" : "在线人数暂不可用";
    this.dom.presenceLabel.textContent = label;
    this.dom.presenceIndicator.setAttribute("aria-label", label);
  }
}
