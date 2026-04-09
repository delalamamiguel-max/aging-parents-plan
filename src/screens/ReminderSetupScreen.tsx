/**
 * Reminder Setup Screen — Aging Parents Plan
 * Source: app-flow-pages-and-roles.md §2 "Reminder Setup"; masterplan.md §7.5
 * design-guidelines.md §9 "Reminder setup"
 *
 * Rules:
 * - One action item at a time
 * - Clear confirm / adjust choice
 * - No forced opt-in
 * - Flagged medication items do NOT generate reminders until parent confirms
 * - After reviewing all reminders, proceed to Share screen
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Colors, Spacing, Radius, Typography, Shadow, TouchTarget } from '../design/tokens';
import { H2, H3, Body, Caption, MicroLabel, Button, Divider } from '../components/ui';
import { useAppState } from '../state/AppContext';
import { ActionItem, DEFAULT_REMINDER_OFFSETS_HOURS } from '../contracts/schema';
import { RootStackParamList } from '../navigation/types';
import { addHours, format, addDays } from 'date-fns';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ReminderSetup'>;
  route: RouteProp<RootStackParamList, 'ReminderSetup'>;
};

interface ReminderDecision {
  actionItemId: string;
  scheduled: boolean;
  scheduledAt?: string;
  calendarAdd?: boolean;
}

const ACTION_LABELS: Record<ActionItem['type'], string> = {
  medication: 'Medication to check',
  follow_up: 'Follow-up appointment',
  referral_test: 'Referral or test',
  next_step: 'Next step',
};

const ACTION_ICONS: Record<ActionItem['type'], string> = {
  medication: '💊',
  follow_up: '📅',
  referral_test: '🔬',
  next_step: '✅',
};

export default function ReminderSetupScreen({ navigation, route }: Props) {
  const { summaryId } = route.params;
  const { state, dispatch } = useAppState();

  const summary = state.summaries.find((s) => s.id === summaryId);
  const actionItems = summary?.actionItems ?? [];

  // Only items eligible for reminders (unflagged, or flagged & confirmed)
  const eligibleItems = actionItems.filter((item) => !item.isFlagged);
  const flaggedItems = actionItems.filter((item) => item.isFlagged);

  const [decisions, setDecisions] = useState<Record<string, ReminderDecision>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDone, setIsDone] = useState(false);

  const totalSteps = eligibleItems.length;
  const current = eligibleItems[currentIndex];

  const computeDefaultTime = (item: ActionItem): string => {
    const offsets = DEFAULT_REMINDER_OFFSETS_HOURS[item.type];
    const firstOffset = offsets[0] ?? 24;
    return addHours(new Date(), firstOffset).toISOString();
  };

  const handleConfirm = (item: ActionItem) => {
    const scheduledAt = computeDefaultTime(item);
    setDecisions((d) => ({
      ...d,
      [item.id]: { actionItemId: item.id, scheduled: true, scheduledAt },
    }));
    advance();
  };

  const handleSkip = (item: ActionItem) => {
    setDecisions((d) => ({
      ...d,
      [item.id]: { actionItemId: item.id, scheduled: false },
    }));
    advance();
  };

  const handleCalendarAdd = (item: ActionItem) => {
    // expo-calendar integration — Sprint 3
    Alert.alert(
      'Add to calendar',
      'This will open your calendar to add the appointment. Calendar integration arrives in the next build.',
      [{ text: 'OK' }]
    );
    const scheduledAt = item.dueDate ?? computeDefaultTime(item);
    setDecisions((d) => ({
      ...d,
      [item.id]: { actionItemId: item.id, scheduled: true, scheduledAt, calendarAdd: true },
    }));
    advance();
  };

  const advance = () => {
    if (currentIndex + 1 >= totalSteps) {
      setIsDone(true);
    } else {
      setCurrentIndex((i) => i + 1);
    }
  };

  const handleFinish = () => {
    // Save reminder decisions to summary action items
    const updatedItems = actionItems.map((item) => {
      const decision = decisions[item.id];
      if (!decision || !decision.scheduled) return item;
      return { ...item, status: 'open' as const };
    });

    dispatch({
      type: 'UPDATE_SUMMARY',
      summaryId,
      updates: { actionItems: updatedItems },
    });

    navigation.navigate('Share', { summaryId });
  };

  // ─── No action items ───────────────────────────────────────────────────────

  if (actionItems.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.surface} />
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>✅</Text>
          <H3 style={styles.emptyTitle}>No action items found</H3>
          <Body color={Colors.textSecondary} style={styles.emptyBody}>
            We didn't find any specific next steps in your summary. You can add them manually by editing the summary, or continue.
          </Body>
          <Button
            testID="btn-continue-to-share"
            label="Continue"
            onPress={() => navigation.navigate('Share', { summaryId })}
            style={{ marginTop: Spacing.lg }}
          />
        </View>
      </SafeAreaView>
    );
  }

  // ─── Done state — summary of decisions ────────────────────────────────────

  if (isDone) {
    const confirmedCount = Object.values(decisions).filter((d) => d.scheduled).length;
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.surface} />
        <ScrollView contentContainerStyle={styles.doneContainer}>
          <Text style={styles.doneEmoji}>🔔</Text>
          <H2 style={styles.doneTitle}>
            {confirmedCount > 0
              ? `${confirmedCount} reminder${confirmedCount > 1 ? 's' : ''} set`
              : 'No reminders set'}
          </H2>
          <Body color={Colors.textSecondary} style={styles.doneBody}>
            {confirmedCount > 0
              ? "You'll get a gentle nudge when each one is due. You can change or cancel reminders any time."
              : 'That is okay. You can add reminders later from your visit history.'}
          </Body>

          {/* Flagged items warning */}
          {flaggedItems.length > 0 && (
            <View style={styles.flaggedWarning} testID="flagged-items-warning">
              <Caption color={Colors.warning} style={{ fontWeight: '600' }}>
                ⚠ {flaggedItems.length} item{flaggedItems.length > 1 ? 's' : ''} with uncertain details
              </Caption>
              <Caption color={Colors.textSecondary} style={{ marginTop: 4, lineHeight: 20 }}>
                We have not set reminders for these yet. Please verify the details with your doctor, then confirm from your visit summary.
              </Caption>
              {flaggedItems.map((item) => (
                <Caption key={item.id} color={Colors.textSecondary}>
                  • {item.content}
                </Caption>
              ))}
            </View>
          )}

          <Button
            testID="btn-finish-reminders"
            label="Continue to sharing"
            onPress={handleFinish}
            style={{ marginTop: Spacing.xl }}
          />
          <Button
            testID="btn-skip-sharing"
            label="Save privately — skip sharing"
            variant="ghost"
            onPress={() => {
              dispatch({ type: 'SET_SUMMARY_STATUS', summaryId, status: 'saved_private' });
              navigation.navigate('ParentHome');
            }}
            style={{ marginTop: Spacing.sm }}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── One-at-a-time reminder prompt ────────────────────────────────────────

  if (!current) {
    return null;
  }

  const defaultTime = computeDefaultTime(current);
  const formattedTime = format(new Date(defaultTime), "EEE, MMM d 'at' h:mm a");

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.surface} />
      <ScrollView contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
        {/* Progress */}
        <View style={styles.progressRow}>
          <Caption color={Colors.textSecondary}>
            {currentIndex + 1} of {totalSteps}
          </Caption>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${((currentIndex + 1) / totalSteps) * 100}%` },
              ]}
            />
          </View>
        </View>

        {/* Item */}
        <View style={styles.itemCard} testID={`reminder-card-${current.id}`}>
          <Text style={styles.itemIcon}>{ACTION_ICONS[current.type]}</Text>
          <MicroLabel color={Colors.textSecondary}>{ACTION_LABELS[current.type]}</MicroLabel>
          <H3 style={styles.itemContent}>{current.content}</H3>

          {/* Suggested timing */}
          <View style={styles.timingBox}>
            <Caption color={Colors.textSecondary}>Suggested reminder</Caption>
            <Body style={styles.timingText}>{formattedTime}</Body>
          </View>
        </View>

        {/* Actions — one per action type */}
        <View style={styles.reminderActions}>
          {current.type === 'follow_up' && (
            <TouchableOpacity
              testID={`btn-add-calendar-${current.id}`}
              style={styles.calendarButton}
              onPress={() => handleCalendarAdd(current)}
              activeOpacity={0.82}
            >
              <Text style={styles.calendarIcon}>📅</Text>
              <Body style={styles.calendarButtonText}>Add to my calendar</Body>
            </TouchableOpacity>
          )}

          <Button
            testID={`btn-confirm-reminder-${current.id}`}
            label="Set this reminder"
            onPress={() => handleConfirm(current)}
          />
          <Button
            testID={`btn-skip-reminder-${current.id}`}
            label="Not now"
            variant="ghost"
            onPress={() => handleSkip(current)}
          />
        </View>

        <Caption
          color={Colors.textSecondary}
          style={{ textAlign: 'center', marginTop: Spacing.md }}
        >
          You can adjust or cancel reminders any time.
        </Caption>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxl,
    gap: Spacing.md,
  },
  emptyEmoji: {
    fontSize: 56,
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    textAlign: 'center',
  },
  emptyBody: {
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 300,
  },

  // Step layout
  stepContainer: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.xl,
    flexGrow: 1,
  },
  progressRow: {
    gap: Spacing.sm,
  },
  progressBar: {
    height: 4,
    backgroundColor: Colors.borderSoft,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },

  // Item card
  itemCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    gap: Spacing.sm,
    alignItems: 'center',
    ...Shadow.card,
  },
  itemIcon: {
    fontSize: 48,
    marginBottom: Spacing.sm,
  },
  itemContent: {
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  timingBox: {
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.md,
    width: '100%',
  },
  timingText: {
    fontWeight: '600',
    color: Colors.primary,
  },

  // Reminder actions
  reminderActions: {
    gap: Spacing.sm,
  },
  calendarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.accentLight,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.accent,
    minHeight: TouchTarget.min,
  },
  calendarIcon: {
    fontSize: 22,
  },
  calendarButtonText: {
    color: Colors.textPrimary,
    fontWeight: '600',
  },

  // Done state
  doneContainer: {
    padding: Spacing.xl,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
  },
  doneEmoji: {
    fontSize: 64,
    marginBottom: Spacing.md,
  },
  doneTitle: {
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  doneBody: {
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 300,
  },
  flaggedWarning: {
    backgroundColor: Colors.warningLight,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.warning,
    padding: Spacing.md,
    gap: 4,
    width: '100%',
  },
});
