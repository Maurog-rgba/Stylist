import React, { useCallback, useEffect, useState } from 'react';
import {
  StatusBar,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CameraScreen } from './src/screens/CameraScreen';
import { ResultModal } from './src/components/ResultModal';
import { useModel, type ModelState } from './src/hooks/useModel';
import type { InferenceResult, ImageInput } from './src/services/types';

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const { state, initialize, service } = useModel();
  const [inferring, setInferring] = useState(false);
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const handleCapture = useCallback(
    async (image: ImageInput) => {
      setInferring(true);
      try {
        const inferenceResult = await service.infer(image);
        setResult(inferenceResult);
        setModalVisible(true);
      } catch (e: any) {
        setResult({
          score: 0,
          analysis: `Error: ${e.message ?? 'Inference failed'}`,
          tags: [],
          inferenceTimeMs: 0,
        });
        setModalVisible(true);
      } finally {
        setInferring(false);
      }
    },
    [service],
  );

  const handleClose = useCallback(() => {
    setModalVisible(false);
    setResult(null);
  }, []);

  return (
    <View style={styles.container}>
      <CameraScreen onCapture={handleCapture} disabled={state.status !== 'ready' || inferring} />
      <LoadingOverlay state={state} />
      <StatusOverlay inferring={inferring} />
      <ResultModal visible={modalVisible} result={result} onClose={handleClose} />
    </View>
  );
}

function LoadingOverlay({ state }: { state: ModelState }) {
  if (state.status === 'ready') return null;

  return (
    <View style={styles.overlay}>
      <ActivityIndicator size="large" color="#fff" />
      <Text style={styles.overlayText}>
        {state.status === 'idle' && 'Initializing...'}
        {state.status === 'copying' && 'Preparing models...'}
        {state.status === 'loading' && 'Loading AI model...'}
        {state.status === 'error' && 'Error loading model'}
      </Text>
      {state.status === 'error' && (
        <Text style={styles.overlayError}>{state.message}</Text>
      )}
    </View>
  );
}

function StatusOverlay({ inferring }: { inferring: boolean }) {
  if (!inferring) return null;

  return (
    <View style={[styles.overlay, styles.overlayBottom]}>
      <ActivityIndicator size="small" color="#fff" />
      <Text style={styles.statusText}>Analyzing outfit...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    gap: 16,
  },
  overlayBottom: {
    top: undefined,
    bottom: 120,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 16,
    flexDirection: 'row',
    gap: 12,
  },
  overlayText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
  overlayError: {
    color: '#F44336',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: '80%',
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
  },
});

export default App;
