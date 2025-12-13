'use client';

import { useWasm } from '@/context/WasmContext';
import { useState, useEffect } from 'react';
import SplashScreen from './SplashScreen';

export default function WasmGate({ children }: { children: React.ReactNode }) {
  const { isLoading, error } = useWasm();
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => setShowSplash(false), 700);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-900 text-white">
        <div className="text-center">
          <h2 className="text-xl font-bold text-red-500">Error Loading Application</h2>
          <p className="mt-2 text-slate-400">Please refresh the page.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {!isLoading && children}

      {showSplash && (
        <SplashScreen finishLoading={!isLoading} />
      )}
    </>
  );
}