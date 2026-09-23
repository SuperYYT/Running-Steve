export {};

declare global {
  interface Window {
    __THREE_GAME_TEST_HOOKS__?: {
      seed: (value: number) => void;
      setState: (name: string) => { state: string };
      setPausedForScreenshot: (paused: boolean) => void;
      setReducedMotion: (enabled: boolean) => void;
      hideDebugUi: (hidden: boolean) => void;
      addPickups: (n: number) => { combo: number; streak: number; score: number };
    };
    __THREE_GAME_DIAGNOSTICS__?: {
      frame: number;
      elapsed: number;
      state: string;
      score: number;
      distance: number;
      combo: number;
      best: number;
      complete: boolean;
      player: {
        position: { x: number; y: number; z: number };
        lane: number;
        airborne: boolean;
        ducking: boolean;
        speed: number;
      };
      renderer: {
        calls: number;
        triangles: number;
        geometries: number;
        textures: number;
      };
      canvas: {
        clientWidth: number;
        clientHeight: number;
        width: number;
        height: number;
        dpr: number;
      };
    };
  }
}
