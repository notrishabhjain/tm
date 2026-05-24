#!/usr/bin/env node
// Applies dark mode theme overrides to screen files that haven't been updated yet.
// Adds useTheme import + hook call, and replaces hardcoded light color refs with theme refs.

const fs = require('fs');
const path = require('path');

const FILES = [
  'src/app/onboarding/apps.tsx',
  'src/app/onboarding/vip.tsx',
  'src/app/onboarding/nudges.tsx',
  'src/app/onboarding/permissions.tsx',
  'src/app/onboarding/priority.tsx',
  'src/app/onboarding/index.tsx',
  'src/app/onboarding/done.tsx',
  'src/app/settings/vocabulary.tsx',
  'src/app/settings/email-report.tsx',
  'src/app/settings/battery-guide.tsx',
  'src/app/settings/monitored-apps.tsx',
  'src/app/settings/vip-contacts.tsx',
  'src/app/settings/nudges.tsx',
  'src/app/settings/export-import.tsx',
  'src/app/settings/analytics.tsx',
  'src/app/settings/transcript-import.tsx',
  'src/app/share.tsx',
];

const ROOT = path.join(__dirname, '..');

// Replacements to apply in JSX (NOT in StyleSheet.create blocks)
const COLOR_SUBS = [
  [/Colors\.backgroundLight/g, 'theme.background'],
  [/Colors\.surfaceLight/g, 'theme.surface'],
  [/Colors\.surfaceVariantLight/g, 'theme.surfaceVariant'],
  [/Colors\.outlineLight/g, 'theme.outline'],
  [/Colors\.onSurfaceLight/g, 'theme.onSurface'],
  [/Colors\.onSurfaceVariantLight/g, 'theme.onSurfaceVariant'],
  [/Colors\.urgentBgLight/g, 'theme.urgentBg'],
  [/Colors\.highBgLight/g, 'theme.highBg'],
  [/Colors\.mediumBgLight/g, 'theme.mediumBg'],
  [/Colors\.lowBgLight/g, 'theme.lowBg'],
];

for (const relPath of FILES) {
  const filePath = path.join(ROOT, relPath);
  if (!fs.existsSync(filePath)) {
    console.log(`SKIP (missing): ${relPath}`);
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf8');

  // Skip if already has useTheme
  if (content.includes('useTheme')) {
    console.log(`SKIP (already done): ${relPath}`);
    continue;
  }

  // 1. Add useTheme import after the last existing @/ui/theme import, or after Colors import
  if (content.includes("from '@/ui/theme/colors'")) {
    content = content.replace(
      /^(import \{[^}]+\} from '@\/ui\/theme\/colors';)/m,
      "$1\nimport { useTheme } from '@/ui/theme';"
    );
  } else if (content.includes("from '@/ui/theme'")) {
    // Already imports from theme, just add useTheme to the import list
    content = content.replace(/import \{([^}]+)\} from '@\/ui\/theme';/, (match, imports) => {
      if (imports.includes('useTheme')) return match;
      return `import {${imports}, useTheme } from '@/ui/theme';`;
    });
  } else {
    // Add new import at the top after React import
    content = content.replace(
      /^(import React[^\n]*;\n)/m,
      "$1import { useTheme } from '@/ui/theme';\n"
    );
  }

  // 2. Add const theme = useTheme(); inside the default export function
  // Find the default export function and insert theme after the first line of its body
  content = content.replace(
    /^(export default function \w+\([^)]*\)[^{]*\{)\n(\s+)/m,
    (match, fnDecl, indent) => {
      return `${fnDecl}\n${indent}const theme = useTheme();\n${indent}`;
    }
  );

  // 3. Split into StyleSheet section and rest (JSX/non-StyleSheet)
  const styleSheetIdx = content.lastIndexOf('StyleSheet.create(');
  let beforeStyleSheet = styleSheetIdx >= 0 ? content.slice(0, styleSheetIdx) : content;
  let styleSheetSection = styleSheetIdx >= 0 ? content.slice(styleSheetIdx) : '';

  // 4. Apply color substitutions ONLY in the non-StyleSheet part
  for (const [pattern, replacement] of COLOR_SUBS) {
    beforeStyleSheet = beforeStyleSheet.replace(pattern, replacement);
  }

  content = beforeStyleSheet + styleSheetSection;

  // 5. Ensure placeholderTextColor uses theme too (in JSX, not StyleSheet)
  content = content.replace(
    /placeholderTextColor=\{Colors\.onSurfaceVariantLight\}/g,
    'placeholderTextColor={theme.onSurfaceVariant}'
  );

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✓ ${relPath}`);
}
