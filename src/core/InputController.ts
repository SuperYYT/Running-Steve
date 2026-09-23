export type PlayerIntents = {
  leftPressed: boolean;
  rightPressed: boolean;
  jumpPressed: boolean;
  duckPressed: boolean;
  startPressed: boolean;
  pausePressed: boolean;
  restartPressed: boolean;
  homePressed: boolean;
};

type SwipeState = {
  active: boolean;
  id: number | null;
  x: number;
  y: number;
};

const SWIPE_THRESHOLD = 36;

type PointerState = {
  active: boolean;
  id: number | null;
};

export class InputController {
  private readonly keys = new Set<string>();
  private leftBuffer = 0;
  private rightBuffer = 0;
  private jumpBuffer = 0;
  private duckBuffer = 0;
  private startBuffer = 0;
  private pauseBuffer = 0;
  private restartBuffer = 0;
  private homeBuffer = 0;
  private readonly pointerState: PointerState = { active: false, id: null };
  private readonly swipe: SwipeState = { active: false, id: null, x: 0, y: 0 };
  private readonly heldActions = new Set<string>();

  private readonly onKeyDown = (event: KeyboardEvent) => {
    this.keys.add(event.code);
    if (event.repeat) return;
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') this.leftBuffer = 0.18;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') this.rightBuffer = 0.18;
    if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW') {
      this.jumpBuffer = 0.15;
      event.preventDefault();
    }
    if (
      event.code === 'ArrowDown' ||
      event.code === 'KeyS' ||
      event.code === 'ShiftLeft' ||
      event.code === 'ShiftRight'
    ) {
      this.duckBuffer = 0.15;
      event.preventDefault();
    }
    if (event.code === 'Enter' || event.code === 'Space') this.startBuffer = 0.2;
    if (event.code === 'Escape') this.pauseBuffer = 0.2;
    if (event.code === 'KeyR') this.restartBuffer = 0.2;
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };

  private readonly onPointerDown = (event: PointerEvent) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
    const action = target?.dataset.action;
    if (!action || !target) return;
    event.preventDefault();
    this.pointerState.active = true;
    this.pointerState.id = event.pointerId;
    this.heldActions.add(action);
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // synthetic events
    }
    if (action === 'left') this.leftBuffer = 0.18;
    if (action === 'right') this.rightBuffer = 0.18;
    if (action === 'jump') this.jumpBuffer = 0.15;
    if (action === 'duck') this.duckBuffer = 0.15;
    if (action === 'start') this.startBuffer = 0.2;
    if (action === 'restart') this.restartBuffer = 0.2;
    if (action === 'home') this.homeBuffer = 0.2;
    if (action === 'pause') this.pauseBuffer = 0.2;
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    if (this.pointerState.id !== null && event.pointerId !== this.pointerState.id) {
      this.finishSwipe(event);
      return;
    }
    this.finishSwipe(event);
    this.heldActions.clear();
    this.pointerState.active = false;
    this.pointerState.id = null;
  };

  private readonly isUiSurface = (target: EventTarget | null): boolean => {
    const el = target as HTMLElement | null;
    if (!el?.closest) return false;
    return Boolean(el.closest('[data-action], .panel, #hud'));
  };

  private readonly onSurfacePointerDown = (event: PointerEvent) => {
    if (this.isUiSurface(event.target)) return;
    this.swipe.active = true;
    this.swipe.id = event.pointerId;
    this.swipe.x = event.clientX;
    this.swipe.y = event.clientY;
  };

  private readonly finishSwipe = (event: PointerEvent) => {
    if (!this.swipe.active || this.swipe.id !== event.pointerId) return;
    this.swipe.active = false;
    this.swipe.id = null;

    const dx = event.clientX - this.swipe.x;
    const dy = event.clientY - this.swipe.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (absX < SWIPE_THRESHOLD && absY < SWIPE_THRESHOLD) {
      this.startBuffer = 0.2;
      return;
    }

    if (absX >= absY) {
      if (dx < 0) this.leftBuffer = 0.18;
      else this.rightBuffer = 0.18;
      return;
    }

    if (dy < 0) {
      this.jumpBuffer = 0.15;
    } else {
      this.duckBuffer = 0.15;
    }
  };

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerdown', this.onSurfacePointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    window.addEventListener('lostpointercapture', this.onPointerUp);
    window.addEventListener('blur', this.onPointerUp as EventListener);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.onPointerUp(new PointerEvent('pointerup'));
    });
  }

  read(_deltaHint = 1 / 60): PlayerIntents {
    const intents: PlayerIntents = {
      leftPressed: this.leftBuffer > 0,
      rightPressed: this.rightBuffer > 0,
      jumpPressed: this.jumpBuffer > 0,
      duckPressed: this.duckBuffer > 0,
      startPressed: this.startBuffer > 0,
      pausePressed: this.pauseBuffer > 0,
      restartPressed: this.restartBuffer > 0,
      homePressed: this.homeBuffer > 0,
    };
    this.leftBuffer = 0;
    this.rightBuffer = 0;
    this.jumpBuffer = 0;
    this.duckBuffer = 0;
    this.startBuffer = 0;
    this.pauseBuffer = 0;
    this.restartBuffer = 0;
    this.homeBuffer = 0;
    return intents;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerdown', this.onSurfacePointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    window.removeEventListener('lostpointercapture', this.onPointerUp);
    window.removeEventListener('blur', this.onPointerUp as EventListener);
  }
}
