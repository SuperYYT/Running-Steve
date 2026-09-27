import './styles.css';
import './types';
import { AccountPanel } from './systems/AccountPanel';
import { MusicPlayer } from './systems/MusicPlayer';
import { Game } from './game/Game';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');

if (!canvas) {
  throw new Error('Missing #game-canvas element.');
}

const account = new AccountPanel();
const music = new MusicPlayer();
const game = new Game(canvas, {
  onRunStart: () => {
    music.setScreen('playing');
    void account.beginRunToken();
  },
  onRunEnd: (run) => {
    void account.submitRun(run);
  },
  onReturnHome: () => {
    music.setScreen('home');
    void account.reloadLeaderboard();
  },
});
game.start();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.dispose();
  });
}
