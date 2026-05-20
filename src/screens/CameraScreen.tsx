import React, { useCallback, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Text,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  type PhotoFile,
} from 'react-native-vision-camera';
import type { ImageInput } from '../services/types';

interface Props {
  onCapture: (image: ImageInput) => void;
  disabled: boolean;
}

export function CameraScreen({ onCapture, disabled }: Props) {
  const camera = useRef<Camera>(null);
  const { hasPermission, requestPermission } = useCameraPermission();
  const [capturing, setCapturing] = useState(false);

  const device = useCameraDevice('back');

  const handleCapture = useCallback(async () => {
    if (!camera.current || disabled || capturing) return;

    setCapturing(true);
    try {
      const photo: PhotoFile = await camera.current.takePhoto({
        qualityPrioritization: 'speed',
      });

      onCapture({
        path: photo.path,
      });
    } catch (e: any) {
      Alert.alert('Capture Error', e.message ?? 'Failed to capture photo');
    } finally {
      setCapturing(false);
    }
  }, [camera, disabled, capturing, onCapture]);

  if (!hasPermission) {
    return (
      <View style={styles.permission}>
        <Text style={styles.permissionText}>Camera permission required</Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (device == null) {
    return (
      <View style={styles.center}>
        <Text style={styles.whiteText}>No camera available</Text>
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
      <View style={styles.overlay}>
        <TouchableOpacity
          style={[styles.captureButton, (disabled || capturing) && styles.disabled]}
          onPress={handleCapture}
          disabled={disabled || capturing}>
          {capturing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <View style={styles.captureInner} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  overlay: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  captureInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
  },
  disabled: {
    opacity: 0.4,
  },
  permission: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#000',
  },
  permissionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  permissionButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  whiteText: {
    color: '#fff',
    fontSize: 16,
  },
});
