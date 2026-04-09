/**
 * Shared UI Components — Aging Parents Plan
 * Source: design-guidelines.md §7 "Recurring patterns"
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadow, TouchTarget, Motion } from '../design/tokens';

// ─── Typography Components ────────────────────────────────────────────────────

interface TextProps {
  children: React.ReactNode;
  style?: TextStyle | TextStyle[];
  color?: string;
  testID?: string;
}

export const H1 = ({ children, style, color, testID }: TextProps) => (
  <Text
    testID={testID}
    style={[
      {
        fontSize: Typography.size.h1,
        fontWeight: Typography.weight.h1,
        lineHeight: Typography.lineHeight.h1,
        color: color ?? Colors.textPrimary,
        letterSpacing: -0.5,
      },
      style,
    ]}
  >
    {children}
  </Text>
);

export const H2 = ({ children, style, color, testID }: TextProps) => (
  <Text
    testID={testID}
    style={[
      {
        fontSize: Typography.size.h2,
        fontWeight: Typography.weight.h2,
        lineHeight: Typography.lineHeight.h2,
        color: color ?? Colors.textPrimary,
        letterSpacing: -0.3,
      },
      style,
    ]}
  >
    {children}
  </Text>
);

export const H3 = ({ children, style, color, testID }: TextProps) => (
  <Text
    testID={testID}
    style={[
      {
        fontSize: Typography.size.h3,
        fontWeight: Typography.weight.h3,
        lineHeight: Typography.lineHeight.h3,
        color: color ?? Colors.textPrimary,
      },
      style,
    ]}
  >
    {children}
  </Text>
);

export const H4 = ({ children, style, color, testID }: TextProps) => (
  <Text
    testID={testID}
    style={[
      {
        fontSize: Typography.size.h4,
        fontWeight: Typography.weight.h4,
        lineHeight: Typography.lineHeight.h4,
        color: color ?? Colors.textPrimary,
      },
      style,
    ]}
  >
    {children}
  </Text>
);

export const BodyLarge = ({ children, style, color, testID }: TextProps) => (
  <Text
    testID={testID}
    style={[
      {
        fontSize: Typography.size.bodyLarge,
        fontWeight: Typography.weight.bodyLarge,
        lineHeight: Typography.lineHeight.bodyLarge,
        color: color ?? Colors.textPrimary,
      },
      style,
    ]}
  >
    {children}
  </Text>
);

export const Body = ({ children, style, color, testID }: TextProps) => (
  <Text
    testID={testID}
    style={[
      {
        fontSize: Typography.size.body,
        fontWeight: Typography.weight.body,
        lineHeight: Typography.lineHeight.body,
        color: color ?? Colors.textPrimary,
      },
      style,
    ]}
  >
    {children}
  </Text>
);

export const Caption = ({ children, style, color, testID }: TextProps) => (
  <Text
    testID={testID}
    style={[
      {
        fontSize: Typography.size.caption,
        fontWeight: Typography.weight.caption,
        lineHeight: Typography.lineHeight.caption,
        color: color ?? Colors.textSecondary,
      },
      style,
    ]}
  >
    {children}
  </Text>
);

export const MicroLabel = ({ children, style, color, testID }: TextProps) => (
  <Text
    testID={testID}
    style={[
      {
        fontSize: Typography.size.micro,
        fontWeight: Typography.weight.micro,
        lineHeight: Typography.lineHeight.micro,
        color: color ?? Colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
      },
      style,
    ]}
  >
    {children}
  </Text>
);

// ─── Primary Button ───────────────────────────────────────────────────────────
// design-guidelines.md: "one obvious primary action per screen"

interface ButtonProps {
  label: string;
  onPress: () => void;
  isLoading?: boolean;
  isDisabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  style?: ViewStyle;
  testID?: string;
  fullWidth?: boolean;
}

export const Button = ({
  label,
  onPress,
  isLoading = false,
  isDisabled = false,
  variant = 'primary',
  style,
  testID,
  fullWidth = true,
}: ButtonProps) => {
  const bg = {
    primary: Colors.primary,
    secondary: Colors.surfaceElevated,
    ghost: 'transparent',
    destructive: Colors.error,
  }[variant];

  const border = {
    primary: Colors.primary,
    secondary: Colors.borderSoft,
    ghost: 'transparent',
    destructive: Colors.error,
  }[variant];

  const textColor = {
    primary: Colors.surfaceElevated,
    secondary: Colors.textPrimary,
    ghost: Colors.primary,
    destructive: Colors.surfaceElevated,
  }[variant];

  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={isDisabled || isLoading}
      activeOpacity={0.82}
      style={[
        styles.button,
        { backgroundColor: bg, borderColor: border },
        fullWidth && { alignSelf: 'stretch' },
        (isDisabled || isLoading) && styles.buttonDisabled,
        style,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <Text style={[styles.buttonText, { color: textColor }]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
};

// ─── Card ─────────────────────────────────────────────────────────────────────

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  testID?: string;
}

export const Card = ({ children, style, testID }: CardProps) => (
  <View
    testID={testID}
    style={[styles.card, style]}
  >
    {children}
  </View>
);

// ─── Disclaimer Banner ────────────────────────────────────────────────────────
// Source: masterplan.md §7.6 "Disclaimer visible without scrolling"
// design-guidelines.md §9 "Summary review — Disclaimer visible without scrolling"

interface DisclaimerProps {
  text: string;
  label?: string;
  testID?: string;
}

export const DisclaimerBanner = ({ text, label, testID }: DisclaimerProps) => (
  <View testID={testID} style={styles.disclaimerBanner} accessibilityRole="text">
    <MicroLabel color={Colors.textSecondary} style={styles.disclaimerLabel}>
      {label ?? 'Not a medical record'}
    </MicroLabel>
    <Caption color={Colors.textSecondary} style={styles.disclaimerText}>
      {text}
    </Caption>
  </View>
);

// ─── Uncertainty Flag Pill ────────────────────────────────────────────────────
// Source: masterplan.md §7.6 — yellow, raw + interpreted phrase shown

interface UncertaintyFlagProps {
  rawPhrase: string;
  interpretedPhrase: string;
  testID?: string;
}

export const UncertaintyFlag = ({ rawPhrase, interpretedPhrase, testID }: UncertaintyFlagProps) => (
  <View testID={testID} style={styles.uncertaintyContainer} accessibilityRole="text">
    <View style={styles.uncertaintyHeader}>
      <View style={styles.uncertaintyDot} />
      <MicroLabel color={Colors.warning} style={{ letterSpacing: 0.4 }}>
        Needs verification
      </MicroLabel>
    </View>
    <Caption color={Colors.textSecondary}>
      <Text style={{ fontWeight: '600' }}>Heard: </Text>"{rawPhrase}"
    </Caption>
    <Caption color={Colors.textSecondary}>
      <Text style={{ fontWeight: '600' }}>Recorded as: </Text>"{interpretedPhrase}"
    </Caption>
    <Caption color={Colors.warning} style={{ marginTop: 2 }}>
      Not confirmed — please verify.
    </Caption>
  </View>
);

// ─── AI Generated Badge ───────────────────────────────────────────────────────
// Source: masterplan.md §7.6 "AI-generated sections clearly labeled"

export const AIGeneratedBadge = ({ testID }: { testID?: string }) => (
  <View testID={testID} style={styles.aiBadge} accessibilityRole="text">
    <MicroLabel color={Colors.textSecondary} style={{ letterSpacing: 0.3 }}>
      AI-generated — review before relying on it
    </MicroLabel>
  </View>
);

// ─── Section Divider ──────────────────────────────────────────────────────────

export const Divider = ({ style }: { style?: ViewStyle }) => (
  <View style={[styles.divider, style]} />
);

// ─── Loading State ────────────────────────────────────────────────────────────
// design-guidelines.md §5 "Processing states should reassure, not spin endlessly"

interface ProcessingStateProps {
  title: string;
  subtitle: string;
  testID?: string;
}

export const ProcessingState = ({ title, subtitle, testID }: ProcessingStateProps) => (
  <View testID={testID} style={styles.processingContainer}>
    <ActivityIndicator size="large" color={Colors.primary} />
    <H3 style={styles.processingTitle}>{title}</H3>
    <Body color={Colors.textSecondary} style={styles.processingSubtitle}>
      {subtitle}
    </Body>
  </View>
);

// ─── Empty State ──────────────────────────────────────────────────────────────
// design-guidelines.md §5 "Calm and helpful"

interface EmptyStateProps {
  title: string;
  body: string;
  testID?: string;
}

export const EmptyState = ({ title, body, testID }: EmptyStateProps) => (
  <View testID={testID} style={styles.emptyContainer}>
    <H3 style={styles.emptyTitle} color={Colors.textSecondary}>
      {title}
    </H3>
    <Body color={Colors.textSecondary} style={styles.emptyBody}>
      {body}
    </Body>
  </View>
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  button: {
    height: TouchTarget.min,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    fontSize: Typography.size.body,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  card: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    ...Shadow.card,
  },
  disclaimerBanner: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  disclaimerLabel: {
    marginBottom: 2,
  },
  disclaimerText: {
    lineHeight: 20,
  },
  uncertaintyContainer: {
    backgroundColor: Colors.warningLight,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.warning,
    padding: Spacing.sm + 4,
    gap: 4,
    marginVertical: Spacing.xs,
  },
  uncertaintyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: 4,
  },
  uncertaintyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.warning,
  },
  aiBadge: {
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    flexShrink: 0,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderSoft,
    marginVertical: Spacing.md,
  },
  processingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxl,
    gap: Spacing.md,
  },
  processingTitle: {
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  processingSubtitle: {
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 22,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxl,
    gap: Spacing.sm,
  },
  emptyTitle: {
    textAlign: 'center',
  },
  emptyBody: {
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 22,
  },
});
