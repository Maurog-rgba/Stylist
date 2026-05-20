import React, { useCallback, useEffect, useState } from 'react';
import {
  StatusBar,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraScreen } from './src/screens/CameraScreen';
import { ResultModal } from './src/components/ResultModal';
import { MenuSheet, type MenuItem } from './src/components/MenuSheet';
import { useModel, type ModelState } from './src/hooks/useModel';
import { Colors, Spacing, Radius, Typography } from './src/theme';
import type { InferenceResult, ImageInput } from './src/services/types';

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const { state, initialize, service } = useModel();
  const [inferring, setInferring] = useState(false);
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);

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
          analysis: e.message ?? 'Inference failed',
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

  const menuItems: MenuItem[] = [
    {
      key: 'about',
      label: 'About Stylist',
      icon: '📱',
      onPress: () => {
        Alert.alert(
          'Stylist',
          'Offline AI outfit analysis.\n\nModel: LLaVA 1.5 7B Q2_K\nEngine: llama.cpp + mtmd\n\nAll processing is done on-device. Your photos never leave your phone.',
        );
      },
    },
    {
      key: 'model',
      label: 'Model Info',
      icon: '🧠',
      onPress: () => {
        Alert.alert(
          'Model Information',
          'Architecture: LLaVA 1.5\nBase: LLaMA 7B\nVision: CLIP ViT-L/14@336\nQuantization: Q2_K\nContext size: 512 tokens\n\nLoaded via llama.cpp with mmap.',
        );
      },
    },
    {
      key: 'privacy',
      label: 'Privacy',
      icon: '🔒',
      onPress: () => {
        Alert.alert(
          'Privacy',
          'All AI inference runs 100% offline on your device.\n\n• No data sent to any server\n• No internet required for analysis\n• Photos are read once and discarded after inference\n• No analytics, no tracking',
        );
      },
    },
  ];

  return (
    <View style={styles.container}>
      <CameraScreen
        onCapture={handleCapture}
        disabled={state.status !== 'ready' || inferring}
        onMenuPress={() => setMenuVisible(true)}
      />
      <LoadingOverlay state={state} onRetry={initialize} />
      <InferenceOverlay visible={inferring} />
      <ResultModal visible={modalVisible} result={result} onClose={handleClose} />
      <MenuSheet
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        items={menuItems}
      />
    </View>
  );
}

function LoadingOverlay({ state, onRetry }: { state: ModelState; onRetry: () => void }) {
  const insets = useSafeAreaInsets();

  if (state.status === 'ready') return null;

  const statusText = {
    idle: 'Initializing engine...',
    copying: 'Preparing models...',
    loading: 'Loading AI model...',
    error: 'Failed to load model',
  }[state.status];

  return (
    <View style={[styles.overlay, { paddingTop: insets.top }]}>
      <View style={styles.overlayContent}>
        <View style={styles.loadingIconContainer}>
          {state.status === 'error' ? (
            <Text style={styles.loadingIcon}>!</Text>
          ) : (
            <ActivityIndicator size="large" color={Colors.accent} />
          )}
        </View>

        <Text style={styles.overlayTitle}>{statusText}</Text>

        {state.status === 'error' && 'message' in state && (
          <Text style={styles.overlayError}>{state.message}</Text>
        )}

        {state.status === 'loading' && (
          <Text style={styles.overlayHint}>
            This may take a few moments on first launch
          </Text>
        )}

        {state.status === 'error' && (
          <TouchableOpacity style={styles.retryButton} onPress={onRetry} activeOpacity={0.8}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function InferenceOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <View style={[styles.overlay, styles.inferenceOverlay]} pointerEvents="none">
      <View style={styles.inferenceContent}>
        <ActivityIndicator size="large" color={Colors.accent} />
        <Text style={styles.inferenceTitle}>Analyzing outfit...</Text>
        <Text style={styles.inferenceHint}>Processing on-device AI</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  overlayContent: {
    alignItems: 'center',
    padding: Spacing.xl,
    gap: 16,
  },
  loadingIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(108, 99, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  loadingIcon: {
    fontSize: 28,
    color: Colors.error,
    fontWeight: '700',
  },
  overlayTitle: {
    ...Typography.h2,
    color: Colors.text,
    textAlign: 'center',
  },
  overlayError: {
    ...Typography.body,
    color: Colors.error,
    textAlign: 'center',
    maxWidth: 300,
  },
  overlayHint: {
    ...Typography.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.accent,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: Radius.md,
  },
  retryButtonText: {
    ...Typography.h2,
    color: Colors.text,
    fontSize: 15,
  },
  inferenceOverlay: {
    backgroundColor: 'rgba(10, 10, 10, 0.92)',
  },
  inferenceContent: {
    alignItems: 'center',
    gap: 16,
  },
  inferenceTitle: {
    ...Typography.h2,
    color: Colors.text,
  },
  inferenceHint: {
    ...Typography.caption,
    color: Colors.accentLight,
  },
});

export default App;
