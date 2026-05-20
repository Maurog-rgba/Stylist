import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, Typography } from '../theme';

export interface MenuItem {
  key: string;
  label: string;
  icon: string;
  onPress: () => void;
  danger?: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  items: MenuItem[];
}

const SCREEN_HEIGHT = Dimensions.get('window').height;

export function MenuSheet({ visible, onClose, items }: Props) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 22,
          stiffness: 220,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      slideAnim.setValue(SCREEN_HEIGHT);
      fadeAnim.setValue(0);
    }
  }, [visible, slideAnim, fadeAnim]);

  return (
    <Modal
      visible={visible}
      animationType="none"
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + Spacing.lg, transform: [{ translateY: slideAnim }] },
        ]}>
        <View style={styles.handle} />

        <View style={styles.header}>
          <Text style={styles.title}>Menu</Text>
        </View>

        <View style={styles.items}>
          {items.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={styles.menuItem}
              onPress={() => {
                onClose();
                setTimeout(() => item.onPress(), 200);
              }}
              activeOpacity={0.6}>
              <View style={[styles.iconContainer, item.danger && styles.iconContainerDanger]}>
                <Text style={styles.icon}>{item.icon}</Text>
              </View>
              <Text style={[styles.label, item.danger && styles.labelDanger]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={onClose}
          activeOpacity={0.6}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.lg,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: Spacing.sm,
  },
  header: {
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  title: {
    ...Typography.h2,
    color: Colors.text,
    textAlign: 'center',
  },
  items: {
    gap: 2,
    marginBottom: Spacing.md,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    gap: Spacing.md,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(108, 99, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainerDanger: {
    backgroundColor: 'rgba(239, 83, 80, 0.12)',
  },
  icon: {
    fontSize: 18,
  },
  label: {
    ...Typography.body,
    color: Colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  labelDanger: {
    color: Colors.error,
  },
  cancelButton: {
    paddingVertical: 14,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  cancelText: {
    ...Typography.body,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
});
