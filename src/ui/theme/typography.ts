/**
 * Typography scale tokens.
 * Per UI/UX Design Specification Section 2.2.
 */
export const FontFamily = {
  en: 'Inter',
  devanagari: 'NotoSansDevanagari',
  mono: 'JetBrainsMono',
} as const;

export const TypeScale = {
  displayLg: { fontSize: 32, fontWeight: '700' as const, lineHeight: 40 },
  displayMd: { fontSize: 24, fontWeight: '700' as const, lineHeight: 32 },
  headline: { fontSize: 20, fontWeight: '600' as const, lineHeight: 28 },
  titleLg: { fontSize: 18, fontWeight: '600' as const, lineHeight: 24 },
  titleMd: { fontSize: 16, fontWeight: '600' as const, lineHeight: 22 },
  bodyLg: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  bodyMd: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  labelLg: { fontSize: 14, fontWeight: '500' as const, lineHeight: 20 },
  labelMd: { fontSize: 12, fontWeight: '500' as const, lineHeight: 16 },
  caption: { fontSize: 11, fontWeight: '400' as const, lineHeight: 14 },
} as const;
