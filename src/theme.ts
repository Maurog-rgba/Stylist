export const Colors = {
  background: '#0A0A0A',
  surface: '#1A1A2E',
  surfaceLight: '#232340',
  accent: '#6C63FF',
  accentLight: '#8B85FF',
  success: '#4CAF50',
  warning: '#FF9800',
  error: '#EF5350',
  text: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.7)',
  textTertiary: 'rgba(255,255,255,0.45)',
  border: 'rgba(255,255,255,0.08)',
  glassBackground: 'rgba(26, 26, 46, 0.85)',
  glassBorder: 'rgba(255,255,255,0.1)',
  captureRing: 'rgba(108, 99, 255, 0.4)',
  overlayDark: 'rgba(0,0,0,0.6)',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const Typography = {
  h1: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5 },
  h2: { fontSize: 20, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: '400' as const },
  label: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 1, textTransform: 'uppercase' as const },
  score: { fontSize: 48, fontWeight: '800' as const },
};
