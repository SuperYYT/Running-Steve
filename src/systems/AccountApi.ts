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
  bestCombo: number;
  lastDistance: number;
  lastCombo: number;
  runCount: number;
};

export type RunSummary = {
  runToken: string;
  distance: number;
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

export async function startRun(): Promise<{ runId: number; token: string } | null> {
  try {
    const res = await fetch('/api/runs/start', {
      method: 'POST',
      credentials: 'same-origin',
    });
    if (!res.ok) return null;
    return (await res.json()) as { runId: number; token: string };
  } catch {
    return null;
  }
}

export async function submitScore(run: RunSummary): Promise<{
  ok: true;
  bestDistance: number;
  bestCombo: number;
  improved: { distance: boolean; combo: boolean };
  runId: number;
} | { ok: false; error: string } | null> {
  try {
    const res = await fetch('/api/scores', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(run),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const error = typeof json.error === 'string' ? json.error : `http_${res.status}`;
      return { ok: false, error };
    }
    return {
      ok: true,
      bestDistance: Number(json.bestDistance),
      bestCombo: Number(json.bestCombo),
      improved: (json.improved as { distance: boolean; combo: boolean }) ?? {
        distance: false,
        combo: false,
      },
      runId: Number(json.runId),
    };
  } catch {
    return null;
  }
}

export async function fetchLeaderboard(): Promise<{
  distance: LeaderRow[];
  combo: LeaderRow[];
  runs: LeaderRow[];
} | null> {
  try {
    const res = await fetch('/api/leaderboard?limit=10', { credentials: 'same-origin' });
    if (!res.ok) return null;
    return (await res.json()) as {
      distance: LeaderRow[];
      combo: LeaderRow[];
      runs: LeaderRow[];
    };
  } catch {
    return null;
  }
}

export function loginHref(): string {
  return '/auth/login?returnTo=/';
}
