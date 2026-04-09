/**
 * Design Tokens — Aging Parents Plan
 * Source: design-guidelines.md §2–5
 *
 * Single source of truth for all visual decisions.
 * Do not hardcode colors, sizes, or timings outside this file.
 */

// ─── Color System ─────────────────────────────────────────────────────────────
// Source: design-guidelines.md §3
export const Colors = {
  // Core palette
  primary: '#2F5D50',
  secondary: '#6E7C74',
  accent: '#CFAF6B',
  surface: '#F7F5F1',
  surfaceElevated: '#FFFFFF',
  textPrimary: '#1F2A24',
  textSecondary: '#53615A',
  borderSoft: '#D9DDD8',

  // Semantic colors
  success: '#2E7D5A',
  warning: '#D6A94B',  // used for uncertainty flags — NOT alarm red
  error: '#B4534B',    // reserve for destructive / truly blocking only
  info: '#5A7DA8',

  // Derived
  primaryLight: '#EAF0ED',     // low-pressure backgrounds
  accentLight: '#F8F2E6',      // warm tint surfaces
  warningLight: '#FDF6E7',     // uncertainty badge background
  errorLight: '#FAEEED',       // error state background
  successLight: '#EAF5EF',     // success badge background
  overlayDark: 'rgba(31,42,36,0.5)',
  overlayLight: 'rgba(247,245,241,0.9)',
} as const;

// ─── Typography Scale ─────────────────────────────────────────────────────────
// Source: design-guidelines.md §2
export const Typography = {
  fontFamily: {
    // Expo uses system fonts by default; we'll load Inter via expo-font in app entry
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semiBold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
  },

  // Size scale
  size: {
    h1: 32,
    h2: 24,
    h3: 20,
    h4: 16,
    bodyLarge: 18,
    body: 16,
    caption: 14,
    micro: 12,
  },

  // Weight scale
  weight: {
    h1: '700' as const,
    h2: '600' as const,
    h3: '600' as const,
    h4: '600' as const,
    bodyLarge: '400' as const,
    body: '400' as const,
    caption: '400' as const,
    micro: '500' as const,
  },

  // Minimum line-height multiplier: 1.5
  lineHeight: {
    h1: 40,   // 32 * 1.25
    h2: 32,
    h3: 28,
    h4: 24,
    bodyLarge: 28, // 18 * 1.55
    body: 24,      // 16 * 1.5
    caption: 22,
    micro: 18,
  },
} as const;

// ─── Spacing System (8pt grid) ────────────────────────────────────────────────
// Source: design-guidelines.md §4
export const Spacing = {
  xs: 4,    // rare, icon nudges
  sm: 8,    // tight pairings
  md: 16,   // default component spacing
  lg: 24,   // section spacing
  xl: 32,   // major content separation
  xxl: 48,  // screen-level breathing room
} as const;

// ─── Border Radius ────────────────────────────────────────────────────────────
export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

// ─── Motion / Animation Timing ────────────────────────────────────────────────
// Source: design-guidelines.md §5
export const Motion = {
  tapFeedback: 150,        // immediate, button feel
  panelTransition: 200,   // 180–220ms range
  modalEntrance: 240,     // 220–260ms
  successConfirmation: 210, // 180–240ms
  // All durations in ms. Stay within 150–300ms max.
} as const;

// ─── Shadow Levels ────────────────────────────────────────────────────────────
export const Shadow = {
  soft: {
    shadowColor: Colors.textPrimary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  medium: {
    shadowColor: Colors.textPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 5,
  },
  card: {
    shadowColor: Colors.textPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
  },
} as const;

// ─── Touch Target Minimum ────────────────────────────────────────────────────
// Source: design-guidelines.md §8 "Large tap targets"
export const TouchTarget = {
  min: 48, // px — minimum tappable area
} as const;

// ─── Z-Index Stack ────────────────────────────────────────────────────────────
export const ZIndex = {
  base: 0,
  card: 1,
  overlay: 10,
  modal: 20,
  toast: 30,
} as const;
