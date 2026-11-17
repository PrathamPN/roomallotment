import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';

export interface RealtimeEvent {
  type: string;
  reason?: string;
  timestamp?: string;
}

export function useRealtimeSync(
  user: User | null,
  onSyncTrigger: (event: RealtimeEvent) => void
) {
  const [connected, setConnected] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const callbackRef = useRef(onSyncTrigger);
  callbackRef.current = onSyncTrigger;

  useEffect(() => {
    if (!user) {
      setConnected(false);
      return;
    }

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let attempt = 0;

    const connect = async () => {
      if (cancelled) return;
      try {
        const token = await user.getIdToken();
        if (cancelled) return;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
        ws = new WebSocket(url);

        ws.onopen = () => {
          attempt = 0;
          setConnected(true);
        };

        ws.onmessage = (msg) => {
          try {
            const parsed = JSON.parse(msg.data) as RealtimeEvent;
            if (parsed.type === 'workspace:updated') {
              setLastSyncAt(parsed.timestamp ?? new Date().toISOString());
              callbackRef.current(parsed);
            } else if (parsed.type === 'ws:connected') {
              setLastSyncAt(parsed.timestamp ?? new Date().toISOString());
            }
          } catch {
            // Ignore malformed socket frames
          }
        };

        ws.onclose = () => {
          setConnected(false);
          if (!cancelled) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 15000);
            attempt += 1;
            reconnectTimer = setTimeout(connect, delay);
          }
        };

        ws.onerror = () => {
          ws?.close();
        };
      } catch {
        setConnected(false);
      }
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [user]);

  return { connected, lastSyncAt };
}
