import { PixelRatio } from 'react-native';

const fontScale = PixelRatio.getFontScale();

function scaled(size: number): number {
  return Math.round(size * fontScale);
}

export const Typography = {
  displayLg: {
    fontSize: scaled(32),
    fontWeight: '700' as const,
    lineHeight: scaled(40),
    fontFamily: 'Inter-Bold',
  },
  displayMd: {
    fontSize: scaled(24),
    fontWeight: '700' as const,
    lineHeight: scaled(32),
    fontFamily: 'Inter-Bold',
  },
  headline: {
    fontSize: scaled(20),
    fontWeight: '600' as const,
    lineHeight: scaled(28),
    fontFamily: 'Inter-SemiBold',
  },
  titleLg: {
    fontSize: scaled(18),
    fontWeight: '600' as const,
    lineHeight: scaled(24),
    fontFamily: 'Inter-SemiBold',
  },
  titleMd: {
    fontSize: scaled(16),
    fontWeight: '600' as const,
    lineHeight: scaled(22),
    fontFamily: 'Inter-SemiBold',
  },
  bodyLg: {
    fontSize: scaled(16),
    fontWeight: '400' as const,
    lineHeight: scaled(24),
    fontFamily: 'Inter-Regular',
  },
  bodyMd: {
    fontSize: scaled(14),
    fontWeight: '400' as const,
    lineHeight: scaled(20),
    fontFamily: 'Inter-Regular',
  },
  labelLg: {
    fontSize: scaled(14),
    fontWeight: '500' as const,
    lineHeight: scaled(20),
    fontFamily: 'Inter-Medium',
  },
  labelMd: {
    fontSize: scaled(12),
    fontWeight: '500' as const,
    lineHeight: scaled(16),
    fontFamily: 'Inter-Medium',
  },
  caption: {
    fontSize: scaled(11),
    fontWeight: '400' as const,
    lineHeight: scaled(14),
    fontFamily: 'Inter-Regular',
  },
  mono: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: scaled(13),
    lineHeight: scaled(20),
  },
} as const;
