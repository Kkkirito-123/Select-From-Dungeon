import type { DeepSeekWorkerClient } from "../deepseek/DeepSeekWorkerClient";
import type { DeepSeekErrorCode } from "../deepseek/protocol";
import type { LearningLedger } from "../../../src/infrastructure/storage/learningLedger";

const SETTINGS_KEY = "select-from-dungeon:agent-provider-settings:v1";
const CONSENT_VERSION = 1;

interface SafeAgentSettings {
  consentVersion: number;
  model: string | null;
}

const ERROR_COPY: Record<DeepSeekErrorCode, string> = {
  "invalid-key": "DeepSeek 拒绝了该 Key，请检查后重试。",
  "insufficient-balance": "该 DeepSeek 账户余额不足。",
  "rate-limit": "DeepSeek 当前限流，本次不会自动重试。",
  "provider-unavailable": "DeepSeek 暂时不可用，本地复盘仍可使用。",
  "cors-unavailable": "浏览器无法直连 DeepSeek，本地复盘仍可使用。",
  "invalid-response": "DeepSeek 返回了无法验证的内容。",
  "not-configured": "请先连接 DeepSeek。",
};

function readSettings(storage: Storage | null): SafeAgentSettings {
  if (!storage) return { consentVersion: 0, model: null };
  try {
    const value: unknown = JSON.parse(storage.getItem(SETTINGS_KEY) ?? "null");
    if (typeof value !== "object" || value === null) throw new Error("invalid");
    const record = value as Record<string, unknown>;
    return {
      consentVersion: record.consentVersion === CONSENT_VERSION ? CONSENT_VERSION : 0,
      model: typeof record.model === "string" ? record.model : null,
    };
  } catch {
    return { consentVersion: 0, model: null };
  }
}

function writeSettings(storage: Storage | null, value: SafeAgentSettings): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(value));
  } catch {
    // Non-secret preferences are optional; the Agent remains session-only.
  }
}

function downloadJson(value: string): void {
  const url = URL.createObjectURL(new Blob([value], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `sql-dungeon-learning-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export class AgentSettingsPanel {
  private readonly settings: SafeAgentSettings;
  private readonly dialog = document.createElement("dialog");
  private readonly openButton = document.createElement("button");
  private mounted = false;

  constructor(
    private readonly client: DeepSeekWorkerClient,
    private readonly ledger: LearningLedger,
    private readonly onConnected: () => void,
    private readonly storage: Storage | null,
  ) {
    this.settings = readSettings(storage);
  }

  mount(): void {
    if (this.mounted) return;
    this.mounted = true;
    this.openButton.type = "button";
    this.openButton.className = "agent-settings-trigger";
    this.openButton.textContent = "AI 复盘设置";
    this.openButton.addEventListener("click", () => this.dialog.showModal());
    this.dialog.className = "agent-settings-dialog";
    this.dialog.setAttribute("aria-labelledby", "agent-settings-title");
    this.dialog.innerHTML = `
      <form method="dialog" class="agent-settings-card">
        <header>
          <div>
            <p class="eyebrow">OUTPUT-ONLY AGENT</p>
            <h2 id="agent-settings-title">DeepSeek 复盘连接</h2>
          </div>
          <button type="submit" class="agent-settings-close" aria-label="关闭">×</button>
        </header>
        <p class="agent-security-copy">API Key 仅保存在当前标签页的专用 Worker 内存中，不写入 localStorage、sessionStorage、IndexedDB、日志或本项目服务器。复盘证据与 Key 会由浏览器直接发送给 DeepSeek；刷新或关闭页面后必须重新填写。建议使用独立、低额度 Key。</p>
        <label class="agent-consent-row">
          <input id="agent-consent" type="checkbox" />
          <span>我了解浏览器扩展、同源恶意脚本或设备控制者仍可能读取页面内容。</span>
        </label>
        <label>DeepSeek API Key
          <input id="agent-api-key" type="password" autocomplete="new-password" spellcheck="false" placeholder="仅本标签页内存" />
        </label>
        <div class="agent-settings-actions">
          <button id="agent-connect" type="button">连接 DeepSeek</button>
          <button id="agent-clear-key" type="button" class="secondary">清除 Key</button>
        </div>
        <label>模型
          <select id="agent-model" disabled><option>连接后读取模型</option></select>
        </label>
        <p id="agent-status" class="agent-status" role="status">当前使用离线确定性复盘。</p>
        <hr />
        <div class="agent-settings-actions">
          <button id="agent-export-learning" type="button" class="secondary">导出学习记录</button>
          <button id="agent-clear-learning" type="button" class="danger">清除学习记录</button>
        </div>
      </form>
    `;
    document.body.append(this.openButton, this.dialog);
    const consent = this.required<HTMLInputElement>("#agent-consent");
    consent.checked = this.settings.consentVersion === CONSENT_VERSION;
    const keyInput = this.required<HTMLInputElement>("#agent-api-key");
    const modelSelect = this.required<HTMLSelectElement>("#agent-model");
    const status = this.required<HTMLElement>("#agent-status");
    this.required<HTMLButtonElement>("#agent-connect").addEventListener("click", () => {
      if (!consent.checked) {
        status.textContent = "请先确认密钥与证据发送边界。";
        status.dataset.kind = "warning";
        return;
      }
      const key = keyInput.value;
      keyInput.value = "";
      status.textContent = "正在由浏览器直连 DeepSeek…";
      status.dataset.kind = "pending";
      void this.client.connect(key, this.settings.model).then((result) => {
        if (!result.ok) {
          status.textContent = ERROR_COPY[result.error ?? "provider-unavailable"];
          status.dataset.kind = "error";
          return;
        }
        modelSelect.replaceChildren(...result.models.map((model) => {
          const option = document.createElement("option");
          option.value = model;
          option.textContent = model;
          option.selected = model === this.client.model;
          return option;
        }));
        modelSelect.disabled = false;
        this.settings.consentVersion = CONSENT_VERSION;
        this.settings.model = this.client.model;
        writeSettings(this.storage, this.settings);
        status.textContent = `已连接 ${this.client.model ?? "DeepSeek"}；Key 不会返回本项目服务器。`;
        status.dataset.kind = "success";
        this.onConnected();
      });
    });
    modelSelect.addEventListener("change", () => {
      if (!this.client.selectModel(modelSelect.value)) return;
      this.settings.model = modelSelect.value;
      writeSettings(this.storage, this.settings);
      status.textContent = `已选择 ${modelSelect.value}。`;
      status.dataset.kind = "success";
      this.onConnected();
    });
    this.required<HTMLButtonElement>("#agent-clear-key").addEventListener("click", () => {
      this.client.disconnect();
      modelSelect.disabled = true;
      modelSelect.innerHTML = "<option>连接后读取模型</option>";
      keyInput.value = "";
      status.textContent = "Key 已从当前标签页内存清除，继续使用本地复盘。";
      status.dataset.kind = "success";
    });
    this.required<HTMLButtonElement>("#agent-export-learning").addEventListener("click", () => {
      void this.ledger.exportJson().then((value) => {
        if (value) downloadJson(value);
        status.textContent = value ? "学习记录已导出。" : "当前浏览器无法导出学习记录。";
      });
    });
    this.required<HTMLButtonElement>("#agent-clear-learning").addEventListener("click", () => {
      if (!window.confirm("确定清除本浏览器中的完整学习账本与聚合统计吗？此操作不可撤销。")) return;
      void this.ledger.clear().then((cleared) => {
        status.textContent = cleared ? "本地学习记录已清除。" : "清除失败，游戏进度未受影响。";
      });
    });
  }

  destroy(): void {
    this.client.destroy();
    this.dialog.remove();
    this.openButton.remove();
    this.mounted = false;
  }

  private required<T extends Element>(selector: string): T {
    const element = this.dialog.querySelector<T>(selector);
    if (!element) throw new Error(`Agent 设置缺少元素：${selector}`);
    return element;
  }
}
