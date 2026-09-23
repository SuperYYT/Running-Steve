export type LeaderRow = {
  rank: number;
  username: string;
  avatarUrl: string | null;
  value: number;
};

export type SessionUser = {
  id: number;
  username: string;
  avatarUrl: string | null;
  bestDistance: number;
  bestScore: number;
  lastDistance: number;
  lastScore: number;
  runCount: number;
  maxCombo: number;
};

export type RunSummary = {
  distance: number;
  score: number;
  maxCombo: number;
  durationMs: number;
  cookies: number;
  cakes: number;
  failReason?: string | null;
};

export async function fetchMe(): Promise<SessionUser | null> {
  try {
    const res = await fetch('/api/me', { credentials: 'same-origin' });
    if (!res.ok) return null;
    const json = (await res.json()) as { user: SessionUser | null };
    return json.user ?? null;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
  } catch {
    // ignore
  }
}

export async function submitScore(run: RunSummary): Promise<{
  bestDistance: number;
  bestScore: number;
  improved: { distance: boolean; score: boolean };
  runId: number;
} | null> {
  try {
    const res = await fetch('/api/scores', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(run),
    });
    if (!res.ok) return null;
    return (await res.json()) as {
      bestDistance: number;
      bestScore: number;
      improved: { distance: boolean; score: boolean };
      runId: number;
    };
  } catch {
    return null;
  }
}

export async function fetchLeaderboard(): Promise<{
  distance: LeaderRow[];
  score: LeaderRow[];
} | null> {
  try {
    const res = await fetch('/api/leaderboard?limit=10', { credentials: 'same-origin' });
    if (!res.ok) return null;
    return (await res.json()) as { distance: LeaderRow[]; score: LeaderRow[] };
  } catch {
    return null;
  }
}

export function loginHref(): string {
  return '/auth/login?returnTo=/';
}
