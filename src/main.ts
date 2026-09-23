import './styles.css';
import './types';
import { AccountPanel } from './systems/AccountPanel';
import { Game } from './game/Game';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');

if (!canvas) {
  throw new Error('Missing #game-canvas element.');
}

const account = new AccountPanel();
const game = new Game(canvas, {
  onRunEnd: (run) => {
    void account.submitRun(run);
  },
  onReturnHome: () => {
    void account.reloadLeaderboard();
  },
});
game.start();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.dispose();
  });
}
