import React, { useEffect, useState } from 'react';
import type { ClinicState } from '../types';
import { ThemeToggle } from './ThemeToggle';

type Command =
  | { action: 'StageNextToken' }
  | { action: 'CancelNextToken' }
  | { action: 'AddPatient'; priority: 'Regular' | 'Urgent' }
  | { action: 'RemovePatient'; token: number }
  | { action: 'SetConsultationTime'; seconds: number };

interface Props {
  state: ClinicState;
  sendCommand: (cmd: Command) => void;
  isConnected: boolean;
}

export const ReceptionistPanel: React.FC<Props> = ({ state, sendCommand, isConnected }) => {
  const isProcessing = state.buffer_state.is_locked;
  const [customMinutes, setCustomMinutes] = useState('');
  const [clock, setClock] = useState(new Date());

  // Tick the clock every second for live countdown
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getRemainingCurrentSecs = () => {
    if (!state.active_consultation_start || state.current_token === 0) return 0;
    const start = new Date(state.active_consultation_start).getTime();
    const elapsedSecs = Math.floor((clock.getTime() - start) / 1000);
    return Math.max(0, state.average_consultation_secs - elapsedSecs);
  };

  const remainingCurrentSecs = getRemainingCurrentSecs();
  const totalQueueWaitSecs = remainingCurrentSecs + state.upcoming_queue.length * state.average_consultation_secs;
  const totalEstTime = new Date(clock.getTime() + totalQueueWaitSecs * 1000);


  const bufferProgress = isProcessing
    ? (state.buffer_state.seconds_remaining / 5) * 100
    : 0;

  // Keyboard shortcuts: Space = Call Next, Escape = Undo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

      if (e.code === 'Space' && !isProcessing && state.upcoming_queue.length > 0) {
        e.preventDefault();
        sendCommand({ action: 'StageNextToken' });
      }
      if (e.code === 'Escape' && isProcessing) {
        sendCommand({ action: 'CancelNextToken' });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isProcessing, state.upcoming_queue.length, sendCommand]);

  const handleSetTime = (minutes: number) => {
    sendCommand({ action: 'SetConsultationTime', seconds: minutes * 60 });
  };

  const handleCustomTime = () => {
    const mins = parseInt(customMinutes, 10);
    if (mins >= 1 && mins <= 60) {
      sendCommand({ action: 'SetConsultationTime', seconds: mins * 60 });
      setCustomMinutes('');
    }
  };

  return (
    <div className="h-screen w-screen bg-white dark:bg-slate-900 flex flex-col p-4 md:p-6 select-none transition-colors duration-300 overflow-y-auto">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-0 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Receptionist Command Center</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Queue Cure '26 • {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700">
            <span className="text-sm text-slate-600 dark:text-slate-400">Now Serving: </span>
            <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {state.current_token || '—'}
            </span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 shrink-0">
        {[
          { label: 'Queue Length', value: state.upcoming_queue.length, color: 'text-blue-600 dark:text-blue-400' },
          { label: 'Total Served', value: state.total_served, color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Avg Consult', value: `${Math.floor(state.average_consultation_secs / 60)}m`, color: 'text-purple-600 dark:text-purple-400' },
          { 
            label: `Est. Wait (completion: ${totalEstTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`, 
            value: `${Math.max(0, Math.ceil(totalQueueWaitSecs / 60))}m`, 
            color: 'text-orange-600 dark:text-orange-400' 
          },
        ].map((stat) => (
          <div key={stat.label} className="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700 text-center">
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Main 3-column layout */}
      <div className="flex-1 flex flex-col md:grid md:grid-cols-3 gap-6 min-h-0">
        {/* Left: Add Patient + Consultation Time */}
        <div className="flex flex-col gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wider">Add Patient</h2>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => sendCommand({ action: 'AddPatient', priority: 'Regular' })}
                className="w-full py-4 rounded-lg bg-blue-600 text-white font-bold text-lg hover:bg-blue-700 active:scale-[0.98] transition-all shadow-md"
              >
                + Regular
              </button>
              <button
                onClick={() => sendCommand({ action: 'AddPatient', priority: 'Urgent' })}
                className="w-full py-4 rounded-lg bg-red-500 text-white font-bold text-lg hover:bg-red-600 active:scale-[0.98] transition-all shadow-md"
              >
                ⚡ Urgent
              </button>
            </div>
          </div>

          {/* Consultation time presets + custom input */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wider">Consultation Time</h2>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {[5, 10, 15, 20].map((min) => (
                <button
                  key={min}
                  onClick={() => handleSetTime(min)}
                  className={`py-2 rounded-lg font-medium text-sm transition-all border ${
                    Math.floor(state.average_consultation_secs / 60) === min
                      ? 'bg-purple-600 text-white border-purple-600 shadow-md'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  {min} min
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                value={customMinutes}
                onChange={(e) => setCustomMinutes(e.target.value)}
                placeholder="Custom"
                min={1}
                max={60}
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                onClick={handleCustomTime}
                disabled={!customMinutes}
                className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Set
              </button>
            </div>
          </div>
        </div>

        {/* Center: Call Next button + safety buffer */}
        <div className="flex flex-col items-center justify-center gap-6 py-4 md:py-0">
          {/* Staging countdown visualizer */}
          {isProcessing && (
            <div className="w-full max-w-sm p-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-xl animate-pulse">
              <div className="flex justify-between mb-2 text-sm font-medium text-yellow-800 dark:text-yellow-300">
                <span>Staging: #{state.buffer_state.pending_token}</span>
                <span>{state.buffer_state.seconds_remaining}s</span>
              </div>
              <div className="w-full h-3 bg-yellow-200 dark:bg-yellow-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-yellow-500 transition-all duration-1000 ease-linear rounded-full"
                  style={{ width: `${bufferProgress}%` }}
                />
              </div>
            </div>
          )}

          <button
            onClick={() => sendCommand({ action: 'StageNextToken' })}
            disabled={isProcessing || state.upcoming_queue.length === 0}
            className={`w-48 h-48 rounded-full text-xl font-bold shadow-xl transition-all duration-200 ${
              isProcessing || state.upcoming_queue.length === 0
                ? 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-105 hover:shadow-2xl active:scale-95'
            }`}
          >
            {state.upcoming_queue.length === 0 ? 'Queue Empty' : 'Call Next'}
          </button>

          <div className="flex gap-3">
            <button
              onClick={() => sendCommand({ action: 'CancelNextToken' })}
              disabled={!isProcessing}
              className={`px-6 py-3 rounded-xl font-bold transition-all border-2 ${
                !isProcessing
                  ? 'bg-white dark:bg-slate-800 text-slate-300 dark:text-slate-600 border-slate-200 dark:border-slate-700 cursor-not-allowed'
                  : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-300 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-900/50 hover:scale-105 active:scale-95'
              }`}
            >
              Undo
            </button>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-500">
            <kbd className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-xs font-mono">Space</kbd> Call Next
            {' · '}
            <kbd className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-xs font-mono">Esc</kbd> Undo
          </p>
        </div>

        {/* Right: Queue list */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col min-h-[300px] md:min-h-0">
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wider">
            Queue ({state.upcoming_queue.length})
          </h2>
          <div className="flex-1 overflow-y-auto space-y-2">
            {state.upcoming_queue.map((item) => (
              <div
                key={item.token}
                className={`flex items-center justify-between px-4 py-3 rounded-lg border transition-all ${
                  item.priority === 'Urgent'
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                    : 'bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl font-mono font-bold text-slate-900 dark:text-white">
                    #{item.token}
                  </span>
                  {item.priority === 'Urgent' && (
                    <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full">
                      URGENT
                    </span>
                  )}
                </div>
                <button
                  onClick={() => sendCommand({ action: 'RemovePatient', token: item.token })}
                  disabled={isProcessing && state.buffer_state.pending_token === item.token}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 dark:text-slate-500 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-500 dark:hover:text-red-400 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Remove patient"
                >
                  ✕
                </button>
              </div>
            ))}
            {state.upcoming_queue.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm py-8">
                No patients in queue
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};