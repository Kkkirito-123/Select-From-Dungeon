import type { StoryAction } from "../../../content/world/floorExperience";
import type { Position } from "../../../domain/shared/types";
import {
  isGameplayShortcutCaptured,
  parseExternalMoveDetail,
} from "../gameInput";

const KEY_TO_DIRECTION: Readonly<Record<string, Position>> = {
  KeyW: { x: 0, y: -1 },
  ArrowUp: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

export interface DungeonInputPorts {
  canAccept(): boolean;
  canMove(): boolean;
  move(direction: Position): void;
  interact(): void;
  storyActions(actions: readonly StoryAction[]): void;
  resetMovement(): void;
}

/**
 * Owns browser input state and forwards semantic actions through a one-way port.
 * The controller has no access to GameSession or Phaser scene lifecycle.
 */
export class DungeonInputController {
  private readonly pressedDirections = new Map<string, Position>();
  private nextHeldMoveAt = 0;
  private pagePausedValue = false;
  private bound = false;

  constructor(private readonly ports: DungeonInputPorts) {}

  get pagePaused(): boolean {
    return this.pagePausedValue;
  }

  bind(): void {
    if (this.bound) return;
    this.bound = true;
    window.addEventListener("keydown", this.keyDownHandler);
    window.addEventListener("keyup", this.keyUpHandler);
    window.addEventListener("blur", this.blurHandler);
    window.addEventListener("focus", this.focusHandler);
    document.addEventListener("visibilitychange", this.visibilityHandler);
    window.addEventListener("dungeon:move", this.externalMoveHandler);
    window.addEventListener("dungeon:interact", this.externalInteractHandler);
    window.addEventListener("dungeon:story-actions", this.storyActionsHandler);
  }

  unbind(): void {
    if (!this.bound) return;
    this.bound = false;
    window.removeEventListener("keydown", this.keyDownHandler);
    window.removeEventListener("keyup", this.keyUpHandler);
    window.removeEventListener("blur", this.blurHandler);
    window.removeEventListener("focus", this.focusHandler);
    document.removeEventListener("visibilitychange", this.visibilityHandler);
    window.removeEventListener("dungeon:move", this.externalMoveHandler);
    window.removeEventListener("dungeon:interact", this.externalInteractHandler);
    window.removeEventListener("dungeon:story-actions", this.storyActionsHandler);
    this.reset();
  }

  update(time: number): void {
    if (
      time < this.nextHeldMoveAt ||
      !this.ports.canMove() ||
      this.pressedDirections.size === 0
    ) return;
    const direction = [...this.pressedDirections.values()].at(-1);
    if (!direction) return;
    this.ports.move(direction);
    this.nextHeldMoveAt = time + 125;
  }

  reset(): void {
    this.clearHeldDirections();
    this.ports.resetMovement();
  }

  clearHeldDirections(): void {
    this.pressedDirections.clear();
    this.nextHeldMoveAt = 0;
  }

  private readonly externalMoveHandler = (event: Event): void => {
    if (!this.ports.canAccept()) return;
    const direction = parseExternalMoveDetail((event as CustomEvent<unknown>).detail);
    if (direction) this.ports.move(direction);
  };

  private readonly externalInteractHandler = (): void => {
    if (this.ports.canAccept()) this.ports.interact();
  };

  private readonly storyActionsHandler = (event: Event): void => {
    const actions = (event as CustomEvent<{
      actions?: readonly StoryAction[];
    }>).detail?.actions;
    if (actions && actions.length > 0) this.ports.storyActions(actions);
  };

  private readonly keyDownHandler = (event: KeyboardEvent): void => {
    if (!this.ports.canAccept() || isGameplayShortcutCaptured(event.target)) return;
    if (event.code === "KeyE") {
      if (!event.repeat) this.ports.interact();
      return;
    }
    const direction = KEY_TO_DIRECTION[event.code];
    if (!direction) return;
    event.preventDefault();
    this.pressedDirections.set(event.code, direction);
    if (!event.repeat) {
      this.ports.move(direction);
      this.nextHeldMoveAt = performance.now() + 150;
    }
  };

  private readonly keyUpHandler = (event: KeyboardEvent): void => {
    this.pressedDirections.delete(event.code);
  };

  private readonly blurHandler = (): void => {
    this.pagePausedValue = true;
    this.reset();
  };

  private readonly focusHandler = (): void => {
    this.pagePausedValue = document.hidden;
    if (!this.pagePausedValue) this.reset();
  };

  private readonly visibilityHandler = (): void => {
    this.pagePausedValue = document.hidden;
    if (this.pagePausedValue) this.reset();
  };
}
