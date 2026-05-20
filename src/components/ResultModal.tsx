import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { InferenceResult } from '../services/types';
import { Colors, Spacing, Radius, Typography } from '../theme';

interface Props {
  visible: boolean;
  result: InferenceResult | null;
  onClose: () => void;
}

const SCREEN_HEIGHT = Dimensions.get('window').height;

export function ResultModal({ visible, result, onClose }: Props) {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
          stiffness: 200,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      slideAnim.setValue(SCREEN_HEIGHT);
      fadeAnim.setValue(0);
    }
  }, [visible, slideAnim, fadeAnim]);

  if (!result) return null;

  const { score, analysis, tags, inferenceTimeMs } = result;
  const insets = useSafeAreaInsets();

  const scoreColor =
    score >= 70 ? Colors.success : score >= 40 ? Colors.warning : Colors.error;

  const isError = inferenceTimeMs === 0 && score === 0;

  const scoreAngle = scoreAnim(score);

  return (
    <Modal
      visible={visible}
      animationType="none"
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />

        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: insets.bottom + Spacing.lg,
              transform: [{ translateY: slideAnim }],
            },
          ]}>
          <View style={styles.handle} />

          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            bounces={false}>
            <Animated.View style={{ opacity: fadeAnim }}>
              {isError ? (
                <View style={styles.errorSection}>
                  <View style={styles.errorIconContainer}>
                    <Text style={styles.errorIcon}>!</Text>
                  </View>
                  <Text style={styles.errorTitle}>Analysis Failed</Text>
                  <Text style={styles.errorMessage}>{analysis}</Text>
                </View>
              ) : (
                <>
                  <View style={styles.scoreSection}>
                    <View style={[styles.scoreRing, { borderColor: scoreColor + '40' }]}>
                      <View style={[styles.scoreRingTrack, { borderColor: scoreColor }]} />
                      <Text style={[styles.scoreText, { color: scoreColor }]}>{score}</Text>
                    </View>
                    <Text style={styles.scoreLabel}>Style Score</Text>
                    <View style={styles.scoreBarContainer}>
                      <View style={styles.scoreBar}>
                        <View
                          style={[
                            styles.scoreBarFill,
                            { width: `${score}%`, backgroundColor: scoreColor },
                          ]}
                        />
                      </View>
                      <View style={styles.scoreBarLabels}>
                        <Text style={styles.scoreBarLabel}>0</Text>
                        <Text style={styles.scoreBarLabel}>100</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.metaRow}>
                    <View style={styles.metaItem}>
                      <Text style={styles.metaValue}>{inferenceTimeMs}ms</Text>
                      <Text style={styles.metaLabel}>Inference</Text>
                    </View>
                    <View style={styles.metaDivider} />
                    <View style={styles.metaItem}>
                      <Text style={styles.metaValue}>On-device</Text>
                      <Text style={styles.metaLabel}>Privacy</Text>
                    </View>
                  </View>

                  {tags.length > 0 && (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>TAGS</Text>
                      <View style={styles.tagsContainer}>
                        {tags.map((tag, i) => (
                          <View key={i} style={styles.tag}>
                            <Text style={styles.tagText}>{tag}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>ANALYSIS</Text>
                    <Text style={styles.analysisText}>{analysis}</Text>
                  </View>
                </>
              )}
            </Animated.View>
          </ScrollView>

          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            activeOpacity={0.8}>
            <Text style={styles.closeButtonText}>New Photo</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

function scoreAnim(score: number): number {
  return (score / 100) * 360;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    maxHeight: '85%',
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
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  scoreSection: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  scoreRing: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  scoreRingTrack: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 65,
    borderWidth: 4,
    borderColor: Colors.accent,
    opacity: 0.6,
  },
  scoreText: {
    ...Typography.score,
  },
  scoreLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  scoreBarContainer: {
    width: '100%',
    maxWidth: 260,
  },
  scoreBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  scoreBarLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  scoreBarLabel: {
    ...Typography.label,
    color: Colors.textTertiary,
    fontSize: 9,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.xl,
    marginBottom: Spacing.xl,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  metaItem: {
    alignItems: 'center',
    gap: 2,
  },
  metaValue: {
    ...Typography.h2,
    color: Colors.accentLight,
    fontSize: 16,
  },
  metaLabel: {
    ...Typography.caption,
    color: Colors.textTertiary,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  metaDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.border,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.label,
    color: Colors.accentLight,
    marginBottom: Spacing.sm,
  },
  analysisText: {
    ...Typography.body,
    color: Colors.textSecondary,
    lineHeight: 24,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  tag: {
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.2)',
  },
  tagText: {
    ...Typography.caption,
    color: Colors.accentLight,
  },
  errorSection: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    gap: Spacing.md,
  },
  errorIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(239, 83, 80, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  errorIcon: {
    fontSize: 24,
    color: Colors.error,
    fontWeight: '700',
  },
  errorTitle: {
    ...Typography.h2,
    color: Colors.error,
  },
  errorMessage: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 22,
  },
  closeButton: {
    backgroundColor: Colors.accent,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    paddingVertical: 16,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  closeButtonText: {
    ...Typography.h2,
    color: Colors.text,
    fontSize: 16,
  },
});
