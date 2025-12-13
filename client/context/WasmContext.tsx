'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

interface WasmContextType {
  wasm: any | null;
  isLoading: boolean;
  error: Error | null;
}

const WasmContext = createContext<WasmContextType>({
  wasm: null,
  isLoading: true,
  error: null,
});

export const WasmProvider = ({ children }: { children: React.ReactNode }) => {
  const [wasm, setWasm] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadWasm = async () => {
      try {
        const wasmModule = await import('onnxruntime-web');
        const session = await wasmModule.InferenceSession.create("./model.onnx", {
          executionProviders: ["wasm"],
        });

        setWasm(wasmModule);
        await session.release();
      } catch (err: any) {
        console.error("Failed to load WASM", err);
        setError(err);
      } finally {
        setIsLoading(false);
      }
    };

    loadWasm();
  }, []);

  return (
    <WasmContext.Provider value={{ wasm, isLoading, error }}>
      {children}
    </WasmContext.Provider>
  );
};

export const useWasm = () => useContext(WasmContext);