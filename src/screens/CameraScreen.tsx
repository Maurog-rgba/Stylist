import React, { useCallback, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Text,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  type PhotoFile,
} from 'react-native-vision-camera';
import { Colors, Spacing, Radius, Typography } from '../theme';
import type { ImageInput } from '../services/types';

interface Props {
  onCapture: (image: ImageInput) => void;
  disabled: boolean;
  onMenuPress: () => void;
}

export function CameraScreen({ onCapture, disabled, onMenuPress }: Props) {
  const insets = useSafeAreaInsets();
  const camera = useRef<Camera>(null);
  const { hasPermission, requestPermission } = useCameraPermission();
  const [capturing, setCapturing] = useState(false);

  const device = useCameraDevice('back');

  const handleCapture = useCallback(async () => {
    if (!camera.current || disabled || capturing) return;

    setCapturing(true);
    try {
      const photo: PhotoFile = await camera.current.takePhoto();

      onCapture({ path: photo.path });
    } catch (e: any) {
      Alert.alert('Capture Error', e.message ?? 'Failed to capture photo');
    } finally {
      setCapturing(false);
    }
  }, [camera, disabled, capturing, onCapture]);

  if (!hasPermission) {
    return (
      <View style={styles.permission}>
        <View style={styles.permissionIconContainer}>
          <Text style={styles.permissionIcon}>📸</Text>
        </View>
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionSubtitle}>
          Stylist needs camera access to analyze your outfits. Your photos are
          processed entirely on-device.
        </Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={requestPermission}
          activeOpacity={0.8}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (device == null) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionTitle}>No Camera Available</Text>
        <Text style={styles.permissionSubtitle}>
          This device doesn't have a rear camera.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={!disabled}
        photo={true}
      />

      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.md }]}>
        <TouchableOpacity style={styles.menuButton} onPress={onMenuPress} activeOpacity={0.6}>
          <Text style={styles.menuIcon}>☰</Text>
        </TouchableOpacity>

        <View style={styles.modeBadge}>
          <View style={styles.modeDot} />
          <Text style={styles.modeText}>PHOTO</Text>
        </View>

        <View style={styles.menuButton} />
      </View>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.placeholder} />

        <TouchableOpacity
          style={[styles.captureRing, (disabled || capturing) && styles.disabled]}
          onPress={handleCapture}
          disabled={disabled || capturing}
          activeOpacity={0.75}>
          <View style={styles.captureOuter}>
            {capturing ? (
              <ActivityIndicator color={Colors.accent} size="large" />
            ) : (
              <View style={styles.captureInner} />
            )}
          </View>
        </TouchableOpacity>

        <View style={styles.placeholder} />
      </View>

      <View style={styles.gradientTop} pointerEvents="none" />
      <View style={styles.gradientBottom} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  gradientTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 140,
    opacity: 0.6,
    backgroundColor: Colors.background,
  },
  gradientBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
    opacity: 0.7,
    backgroundColor: Colors.background,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    zIndex: 10,
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuIcon: {
    fontSize: 20,
    color: Colors.text,
  },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.25)',
  },
  modeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent,
  },
  modeText: {
    ...Typography.label,
    color: Colors.accentLight,
    fontSize: 10,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    zIndex: 10,
  },
  placeholder: {
    width: 48,
  },
  captureRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: Colors.captureRing,
  },
  captureOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: Colors.text,
  },
  captureInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.text,
  },
  disabled: {
    opacity: 0.35,
  },
  permission: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    backgroundColor: Colors.background,
    gap: Spacing.md,
  },
  permissionIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(108, 99, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  permissionIcon: {
    fontSize: 32,
  },
  permissionTitle: {
    ...Typography.h2,
    color: Colors.text,
    textAlign: 'center',
  },
  permissionSubtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 22,
  },
  permissionButton: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: Radius.md,
    marginTop: Spacing.sm,
  },
  permissionButtonText: {
    ...Typography.h2,
    color: Colors.text,
    fontSize: 16,
  },
});
