import React from 'react';
import { useQueueSystem } from './hooks/useQueueSystem';
import { PatientDisplay } from './components/PatientDisplay';
import { ReceptionistPanel } from './components/ReceptionistPanel';
import { ThemeProvider } from './context/ThemeProvider';

const App: React.FC = () => {
  const { state, isConnected, sendCommand } = useQueueSystem();

  // Route by URL path: /receptionist → panel, everything else → patient display
  const isReceptionist = window.location.pathname.includes('receptionist');

  return (
    <ThemeProvider>
      {!state ? (
        <div className="h-screen w-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white transition-colors duration-300">
          <div className="animate-pulse text-xl font-light tracking-widest uppercase">Initializing System...</div>
        </div>
      ) : (
        <div className="relative">
          {!isConnected && (
            <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-full shadow-lg z-50 text-sm font-bold animate-pulse">
              Connection Lost. Reconnecting...
            </div>
          )}

          {isReceptionist ? (
            <ReceptionistPanel state={state} sendCommand={sendCommand} isConnected={isConnected} />
          ) : (
            <PatientDisplay state={state} />
          )}
        </div>
      )}
    </ThemeProvider>
  );
};

export default App;