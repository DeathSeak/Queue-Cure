import React, { useEffect, useRef, useState } from 'react';
import type { ClinicState } from '../types';
import { ThemeToggle } from './ThemeToggle';

interface Props {
  state: ClinicState;
}

export const PatientDisplay: React.FC<Props> = ({ state }) => {
  const prevTokenRef = useRef<number>(state.current_token);
  const [isAnimating, setIsAnimating] = useState(false);
  const [clock, setClock] = useState(new Date());
  const [myToken, setMyToken] = useState('');

  // Tick the clock every second
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Announce token changes via speech synthesis and trigger scale animation
  useEffect(() => {
    if (prevTokenRef.current !== state.current_token && state.current_token > 0) {
      const utterance = new SpeechSynthesisUtterance(
        `Now serving token number ${state.current_token}`
      );
      window.speechSynthesis.speak(utterance);
      prevTokenRef.current = state.current_token;

      setIsAnimating(true);
      const timer = setTimeout(() => setIsAnimating(false), 800);
      return () => clearTimeout(timer);
    }
  }, [state.current_token]);

  // Personalized queue lookup — find the patient's position by their token
  const tokenNumber = myToken && parseInt(myToken, 10) >= 1 ? parseInt(myToken, 10) : null;
  const tokenPosition = tokenNumber !== null
    ? state.upcoming_queue.findIndex((q) => q.token === tokenNumber)
    : -1;
  const isCurrentlyServing = tokenNumber !== null && state.current_token === tokenNumber;
  const isInQueue = tokenPosition >= 0;
  const patientsAheadOfMe = isInQueue ? tokenPosition : null;
  const getRemainingCurrentSecs = () => {
    if (!state.active_consultation_start || state.current_token === 0) return 0;
    const start = new Date(state.active_consultation_start).getTime();
    const elapsedSecs = Math.floor((clock.getTime() - start) / 1000);
    return Math.max(0, state.average_consultation_secs - elapsedSecs);
  };

  const remainingCurrentSecs = getRemainingCurrentSecs();

  const myWaitSecs = patientsAheadOfMe !== null
    ? remainingCurrentSecs + patientsAheadOfMe * state.average_consultation_secs
    : null;

  const myEstTime = myWaitSecs !== null
    ? new Date(clock.getTime() + myWaitSecs * 1000)
    : null;

  const patientsAhead = state.upcoming_queue.length;

  const totalQueueWaitSecs = remainingCurrentSecs + patientsAhead * state.average_consultation_secs;
  const totalEstTime = new Date(clock.getTime() + totalQueueWaitSecs * 1000);

  return (
    <div className="min-h-screen w-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-white flex flex-col p-4 md:p-8 select-none transition-colors duration-300 relative overflow-x-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-white via-white to-emerald-50 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20" />

      {/* Top bar: live indicator, clock, theme toggle */}
      <div className="relative z-10 w-full flex justify-between items-center mb-8">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm text-slate-500 dark:text-slate-400">Live</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-500 dark:text-slate-400 font-mono">
            {clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <ThemeToggle />
        </div>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center pb-4 md:pb-8">
        <h1 className="text-2xl md:text-4xl font-light text-slate-800 dark:text-slate-300 mb-4 md:mb-8 tracking-widest uppercase">
          Queue Cure '26
        </h1>

        {/* Current token number (large display) */}
        <div className="text-center mb-8">
          <p className="text-xl md:text-2xl text-slate-500 dark:text-slate-400 mb-2">Now Serving</p>
          {state.current_token > 0 ? (
            <div
              className={`text-[6rem] md:text-[12rem] font-bold leading-none text-emerald-500 dark:text-emerald-400 drop-shadow-[0_0_30px_rgba(16,185,129,0.4)] transition-transform duration-500 ${
                isAnimating ? 'scale-110' : 'scale-100'
              }`}
            >
              {state.current_token}
            </div>
          ) : (
            <div className="text-4xl md:text-6xl font-bold leading-none text-slate-400 dark:text-slate-600 mt-4 md:mt-8 px-4">
              Waiting to start
            </div>
          )}
        </div>

        {/* Total patients in queue badge */}
        {patientsAhead > 0 && (
          <div className="mb-10 px-6 py-3 bg-white/80 dark:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700 shadow-sm">
            <span className="text-xl text-slate-600 dark:text-slate-300">
              <span className="font-bold text-slate-800 dark:text-white">{patientsAhead}</span>
              {' '}patient{patientsAhead !== 1 ? 's' : ''} in queue
            </span>
          </div>
        )}

        {/* Info cards row */}
        <div className="flex flex-col md:flex-row gap-4 md:gap-8 items-stretch md:items-start w-full md:w-auto">
          {/* Check Your Token — personalized wait time lookup */}
          <div className="bg-white/80 dark:bg-slate-800 rounded-xl p-4 md:p-6 min-w-0 md:min-w-[280px] shadow-lg border border-slate-200 dark:border-slate-700 backdrop-blur-sm">
            <h2 className="text-lg text-slate-500 dark:text-slate-400 mb-4 border-b border-slate-200 dark:border-slate-700 pb-2">Check Your Token</h2>
            <div className="flex gap-2 mb-4">
              <input
                type="number"
                value={myToken}
                onChange={(e) => setMyToken(e.target.value)}
                placeholder="Enter token #"
                min={1}
                className="flex-1 px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-lg font-mono text-center focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
              />
              {myToken && (
                <button
                  onClick={() => setMyToken('')}
                  className="px-3 py-3 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 transition-all"
                  title="Clear"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Lookup result: currently serving / in queue / not found */}
            {myToken && tokenNumber !== null && (
              <div className="space-y-2">
                {isCurrentlyServing ? (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg text-center">
                    <p className="text-emerald-700 dark:text-emerald-300 font-bold text-lg">🎉 It's your turn!</p>
                    <p className="text-emerald-600 dark:text-emerald-400 text-sm">Please proceed to the doctor</p>
                  </div>
                ) : isInQueue ? (
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg text-center">
                    <p className="text-blue-700 dark:text-blue-300 font-bold text-2xl">
                      {patientsAheadOfMe} <span className="text-sm font-normal">ahead of you</span>
                    </p>
                    <p className="text-blue-600 dark:text-blue-400 text-lg mt-1">
                      ~{Math.max(0, Math.ceil((myWaitSecs ?? 0) / 60))} min wait
                    </p>
                    {myEstTime && (
                      <p className="text-xs text-blue-500 dark:text-blue-400 mt-0.5 font-medium">
                        Est: {myEstTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg text-center">
                    <p className="text-orange-700 dark:text-orange-300 font-medium">Token #{tokenNumber} not found</p>
                    <p className="text-orange-600 dark:text-orange-400 text-sm mt-1">
                      It may have been served already, or check your token slip
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Upcoming queue (first 5 tokens) */}
          <div className="bg-white/80 dark:bg-slate-800 rounded-xl p-4 md:p-6 min-w-0 md:min-w-[280px] shadow-lg border border-slate-200 dark:border-slate-700 backdrop-blur-sm">
            <h2 className="text-lg text-slate-500 dark:text-slate-400 mb-4 border-b border-slate-200 dark:border-slate-700 pb-2">Upcoming</h2>
            <ul className="space-y-3">
              {state.upcoming_queue.length === 0 ? (
                <li className="text-slate-400 dark:text-slate-500 text-sm">No patients waiting</li>
              ) : (
                state.upcoming_queue.slice(0, 5).map((item, idx) => (
                  <li
                    key={item.token}
                    className={`flex items-center gap-3 text-2xl font-mono ${
                      item.token === tokenNumber
                        ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                        : idx === 0 ? 'text-slate-800 dark:text-white' : 'text-slate-500'
                    }`}
                  >
                    <span>#{item.token}</span>
                    {item.priority === 'Urgent' && (
                      <span className="text-xs font-bold text-red-500 dark:text-red-400 bg-red-100 dark:bg-red-900/40 px-2 py-0.5 rounded-full">
                        URGENT
                      </span>
                    )}
                    {item.token === tokenNumber && (
                      <span className="text-xs font-bold text-emerald-500 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full">
                        YOU
                      </span>
                    )}
                  </li>
                ))
              )}
              {state.upcoming_queue.length > 5 && (
                <li className="text-slate-400 dark:text-slate-500 text-sm">
                  +{state.upcoming_queue.length - 5} more
                </li>
              )}
            </ul>
          </div>

          {/* Estimated wait for the entire queue */}
          <div className="bg-white/80 dark:bg-slate-800 rounded-xl p-4 md:p-6 min-w-0 md:min-w-[280px] shadow-lg border border-slate-200 dark:border-slate-700 backdrop-blur-sm flex flex-col justify-center">
            <h2 className="text-lg text-slate-500 dark:text-slate-400 mb-4 border-b border-slate-200 dark:border-slate-700 pb-2">Total Queue Wait</h2>
            <div className="text-5xl font-bold text-blue-500 dark:text-blue-400">
              {Math.max(0, Math.ceil(totalQueueWaitSecs / 60))}{' '}
              <span className="text-xl">min</span>
            </div>
            <p className="text-slate-600 dark:text-slate-400 mt-2 text-sm font-medium">
              Est: <span className="font-bold text-slate-800 dark:text-slate-200">{totalEstTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </p>
            <p className="text-slate-500 mt-1 text-xs">
              Avg Consult: {Math.floor(state.average_consultation_secs / 60)} min
            </p>
          </div>
        </div>
      </div>

      {/* Staging indicator visible to patients */}
      {state.buffer_state.is_locked && state.buffer_state.pending_token && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 px-6 py-3 bg-yellow-500/20 border border-yellow-500/50 rounded-full backdrop-blur-sm">
          <span className="text-yellow-600 dark:text-yellow-300 font-medium">
            Token #{state.buffer_state.pending_token} being called...
          </span>
        </div>
      )}
    </div>
  );
};