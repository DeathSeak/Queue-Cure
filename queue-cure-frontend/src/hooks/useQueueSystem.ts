import { useEffect, useRef, useState, useCallback } from 'react';
import type { ClinicState } from '../types';

const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/ws`;
const REST_URL = '/api/state';

type Command =
  | { action: 'StageNextToken' }
  | { action: 'CancelNextToken' }
  | { action: 'AddPatient'; priority: 'Regular' | 'Urgent' }
  | { action: 'RemovePatient'; token: number }
  | { action: 'SetConsultationTime'; seconds: number };

export function useQueueSystem() {
  const [state, setState] = useState<ClinicState | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<number>(1000);

  // Fetch current state via REST as a fallback sync
  const syncState = useCallback(async () => {
    try {
      const res = await fetch(REST_URL);
      if (res.ok) {
        const data: ClinicState = await res.json();
        setState(data);
      }
    } catch {
      console.warn('REST sync failed, will retry on reconnect');
    }
  }, []);

  // WebSocket connection with exponential backoff reconnect
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        reconnectTimeout.current = 1000;
        syncState();
      };

      ws.onmessage = (event) => {
        try {
          const newState: ClinicState = JSON.parse(event.data);
          setState(newState);
        } catch (e) {
          console.error('Failed to parse WS message', e);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        setTimeout(() => {
          reconnectTimeout.current = Math.min(reconnectTimeout.current * 2, 30000);
          connect();
        }, reconnectTimeout.current);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      wsRef.current?.close();
    };
  }, [syncState]);

  // Send a typed command to the backend over WebSocket
  const sendCommand = useCallback((command: Command) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(command));
    }
  }, []);

  return { state, isConnected, sendCommand };
}