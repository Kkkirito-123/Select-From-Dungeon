/**
 * 场景交互覆盖层的事件边界。
 *
 * 交互文字、剧情地标和目标提示由 DungeonScene 根据快照计算后传入；这个
 * 小适配器集中处理“显示/隐藏”动作，不直接调用 GameSession。
 */
interface VisibleObject {
  setVisible(visible: boolean): void;
}

export class InteractionOverlay {
  setVisible(element: VisibleObject, visible: boolean): void {
    element.setVisible(visible);
  }
}
