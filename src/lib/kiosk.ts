import type { Music, Timer } from './model';

export type TimerAction = 'pause' | 'resume' | 'cancel' | 'add';
interface NativeTimer {
  timer_id: string;
  name: string;
  seconds_left: number;
  is_active: boolean;
  ends_at: number | string | null;
  finished: boolean;
}
interface KioskState {
  mediaPlayer?: {
    state: string;
    title?: string;
    artist?: string;
    source?: string;
    nowPlayingShown?: boolean;
  };
}
interface KioskBridge {
  version?: string;
  getVoiceTimers?: () => Promise<{ timers: NativeTimer[] } | null>;
  controlVoiceTimer?: (
    id: string,
    action: TimerAction,
    duration?: { minutes: number },
  ) => Promise<boolean>;
  getKioskState?: () => Promise<KioskState | null>;
  ha?: { call: (message: { type: string }) => Promise<unknown> };
}
declare global {
  interface Window {
    kioskSatellite?: KioskBridge;
  }
}

export interface IntegrationStatus {
  bridge: string;
  timers: string;
  media: string;
  ha: string;
  lastTimerUpdate: string | null;
  nativeNowPlaying: boolean;
}
export const initialStatus: IntegrationStatus = {
  bridge: 'Not connected',
  timers: 'Not connected',
  media: 'Not connected',
  ha: 'Not checked',
  lastTimerUpdate: null,
  nativeNowPlaying: false,
};
function deadline(value: NativeTimer['ends_at']): number | null {
  if (value == null) return null;
  const numeric = Number(value);
  const result = Number.isFinite(numeric)
    ? numeric * (numeric < 1e12 ? 1000 : 1)
    : Date.parse(String(value));
  return Number.isFinite(result) && result > 0 ? result : null;
}
export function presentTimers(
  timers: NativeTimer[],
  now = Date.now(),
): Timer[] {
  return timers.map((timer) => {
    const end = deadline(timer.ends_at);
    const seconds = Math.max(
      0,
      Math.ceil(
        timer.is_active && end !== null
          ? (end - now) / 1000
          : timer.seconds_left,
      ),
    );
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remaining = hours
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
      : `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
    return {
      id: timer.timer_id,
      label: timer.name || 'Timer',
      remaining: timer.finished ? 'Finished' : remaining,
      finished: timer.finished,
      paused: !timer.is_active && !timer.finished,
    };
  });
}
function errorCode(error: unknown): string {
  // Do not expose arbitrary server messages, credentials, or HA state in diagnostics.
  const code = (error as { code?: unknown })?.code;
  return typeof code === 'string' && /^[a-z_]+$/.test(code)
    ? code
    : 'request_failed';
}

export function connectKiosk(
  update: (
    timers: Timer[],
    music: Music | null,
    status: IntegrationStatus,
  ) => void,
) {
  const ks = window.kioskSatellite;
  let disposed = false;
  let nativeTimers: NativeTimer[] = [];
  let music: Music | null = null;
  let timerRevision = 0;
  let mediaRevision = 0;
  let refreshRevision = 0;
  let status = {
    ...initialStatus,
    bridge: ks
      ? `Available (${ks.version || 'unknown version'})`
      : 'Unavailable — open as a Kiosk Satellite custom page',
  };
  const emit = () => {
    if (!disposed) update(presentTimers(nativeTimers), music, { ...status });
  };
  const acceptTimers = (snapshot: { timers: NativeTimer[] } | null) => {
    if (!snapshot || !Array.isArray(snapshot.timers)) {
      status.timers = 'Timer snapshot unavailable';
      return;
    }
    nativeTimers = snapshot.timers;
    status.timers = 'Connected';
    status.lastTimerUpdate = new Date().toISOString();
  };
  const acceptMedia = (snapshot: KioskState | null) => {
    if (!snapshot) {
      status.media = 'Kiosk state unavailable';
      return;
    }
    const player = snapshot.mediaPlayer;
    music =
      player?.state === 'playing'
        ? {
            title: player.title || 'Playing',
            artist: player.artist || player.source || '',
          }
        : null;
    status.media = player
      ? `Followed player: ${player.state}`
      : 'No followed player reported';
    status.nativeNowPlaying = Boolean(player?.nowPlayingShown);
  };
  async function refresh() {
    const revision = ++refreshRevision;
    const tr = timerRevision,
      mr = mediaRevision;
    await Promise.all([
      (async () => {
        if (!ks?.getVoiceTimers) {
          status.timers = 'getVoiceTimers unsupported';
          return;
        }
        try {
          const value = await ks.getVoiceTimers();
          if (!disposed && tr === timerRevision && revision === refreshRevision)
            acceptTimers(value);
        } catch {
          if (revision === refreshRevision)
            status.timers = 'Timer snapshot failed';
        }
      })(),
      (async () => {
        if (!ks?.getKioskState) {
          status.media = 'getKioskState unsupported';
          return;
        }
        try {
          const value = await ks.getKioskState();
          if (!disposed && mr === mediaRevision && revision === refreshRevision)
            acceptMedia(value);
        } catch {
          if (revision === refreshRevision) status.media = 'Kiosk state failed';
        }
      })(),
      (async () => {
        if (!ks?.ha?.call) {
          status.ha = 'Shared HA connection unsupported';
          return;
        }
        try {
          await ks.ha.call({ type: 'auth/current_user' });
          if (revision === refreshRevision)
            status.ha = 'Connected (shared connection required)';
        } catch (error) {
          if (revision === refreshRevision)
            status.ha = `Unavailable: ${errorCode(error)} — enable Share Home Assistant connection`;
        }
      })(),
    ]);
    emit();
  }
  const timersChanged = (event: Event) => {
    timerRevision++;
    acceptTimers((event as CustomEvent).detail);
    emit();
  };
  const mediaChanged = (event: Event) => {
    mediaRevision++;
    acceptMedia((event as CustomEvent).detail);
    emit();
  };
  const haClosed = () => {
    status.ha = 'Connection lost';
    emit();
  };
  const resume = () => {
    if (document.visibilityState !== 'hidden') void refresh();
  };
  const listeners: [string, EventListener][] = [
    ['kiosksatellite:voice-timers', timersChanged],
    ['kiosksatellite:kiosk-state', mediaChanged],
    ['kiosksatellite:ha-closed', haClosed],
    ['kiosksatellite:ha-ready', resume],
    ['kiosksatellite:screenon', resume],
    ['pageshow', resume],
    ['focus', resume],
  ];
  for (const [name, listener] of listeners)
    window.addEventListener(name, listener);
  document.addEventListener('visibilitychange', resume);
  const tick = setInterval(emit, 1000);
  emit();
  void refresh();
  return {
    refresh,
    async control(id: string, action: TimerAction): Promise<boolean> {
      if (
        !ks?.controlVoiceTimer ||
        !nativeTimers.some((t) => t.timer_id === id && !t.finished)
      )
        return false;
      try {
        const result = await ks.controlVoiceTimer(
          id,
          action,
          action === 'add' ? { minutes: 1 } : undefined,
        );
        await refresh();
        return result === true;
      } catch {
        return false;
      }
    },
    canControl: Boolean(ks?.controlVoiceTimer),
    dispose() {
      disposed = true;
      clearInterval(tick);
      for (const [name, listener] of listeners)
        window.removeEventListener(name, listener);
      document.removeEventListener('visibilitychange', resume);
    },
  };
}
