import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { ModelService } from '../services/ModelService';

export type ModelState =
  | { status: 'idle' }
  | { status: 'copying' }
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

export function useModel() {
  const [state, setState] = useState<ModelState>({ status: 'idle' });
  const serviceRef = useRef(ModelService.getInstance());
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const initialize = useCallback(async () => {
    try {
      setState({ status: 'copying' });
      await serviceRef.current.ensureModelAssets();

      setState({ status: 'loading' });
      await serviceRef.current.loadModel();

      setState({ status: 'ready' });
    } catch (e: any) {
      setState({ status: 'error', message: e.message ?? String(e) });
    }
  }, []);

  const unload = useCallback(async () => {
    try {
      await serviceRef.current.unloadModel();
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;

      if (prev === 'active' && nextState.match(/inactive|background/)) {
        unload();
      }
    });

    return () => sub.remove();
  }, [unload]);

  return { state, initialize, unload, service: serviceRef.current };
}
