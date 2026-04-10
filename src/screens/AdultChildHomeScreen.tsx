/**
 * Adult Child Home Screen — Aging Parents Plan
 * Source: app-flow-pages-and-roles.md
 *
 * Shows only shared summaries, plus a consolidated 'Open tasks' view.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Spacing, Radius, Typography, Shadow } from '../design/tokens';
import { H1, H3, Body, Caption, MicroLabel, EmptyState, Divider } from '../components/ui';
import { useAppState } from '../state/AppContext';
import { VisitSummary, ActionItem } from '../contracts/schema';
import { RootStackParamList } from '../navigation/types';
import { formatDistanceToNow, format } from 'date-fns';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AdultChildHome'>;
};

export default function AdultChildHomeScreen({ navigation }: Props) {
  const { state, sharedSummaries } = useAppState();

  const handleOpenSummary = (summary: VisitSummary) => {
    // In MVP we can navigate to SummaryReview Screen and pass a readonly flag or let the screen figure it out
    // Given the placeholder, we'll navigate to SummaryReview and let it be readonly for adult child
    navigation.navigate('SummaryReview', { summaryId: summary.id });
  };

  // Collect all open tasks from shared summaries
  const allTasks: { item: ActionItem; summaryId: string; date: string }[] = [];
  sharedSummaries.forEach((s) => {
    s.actionItems.forEach((acc) => {
      if (acc.status === 'open') {
        allTasks.push({ item: acc, summaryId: s.id, date: s.createdAt });
      }
    });
  });

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.surface} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            testID="btn-settings"
            onPress={() => navigation.navigate('Settings')}
            style={styles.settingsButton}
          >
            <Text style={styles.settingsText}>Settings ⚙️</Text>
          </TouchableOpacity>
          <MicroLabel>Aging Parents Plan (Care Partner)</MicroLabel>
          <H1 style={styles.greeting}>
            Your parent's updates
          </H1>
          <Body color={Colors.textSecondary} style={styles.tagline}>
            Stay informed on recent doctor visits and upcoming tasks.
          </Body>
        </View>

        {/* Tasks View */}
        <TouchableOpacity
          style={styles.tasksBanner}
          activeOpacity={0.8}
          // navigate to a dedicated OpenTasks screen if we had one, but we show inline for MVP
        >
          <Text style={styles.tasksIcon}>📋</Text>
          <View style={{ flex: 1 }}>
            <Body style={styles.tasksTitle}>Open Tasks ({allTasks.length})</Body>
            <Caption color={Colors.surfaceElevated} style={{ opacity: 0.85 }}>
              Follow-ups and reminders
            </Caption>
          </View>
          <Text style={styles.tasksChevron}>›</Text>
        </TouchableOpacity>

        {allTasks.length > 0 && (
          <View style={styles.inlineTasks}>
            {allTasks.slice(0, 3).map((task) => (
              <View key={task.item.id} style={styles.taskRow}>
                <Text>🔸</Text>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Body style={{ fontWeight: '500' }}>{task.item.content}</Body>
                  {task.item.dueDate && (
                    <Caption color={Colors.textSecondary}>Due: {format(new Date(task.item.dueDate), 'MMM d')}</Caption>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        <Divider style={{ marginTop: Spacing.lg, marginBottom: Spacing.lg }} />

        {/* Shared summaries */}
        <View style={styles.sectionHeader}>
          <H3>Shared Visits</H3>
        </View>

        {sharedSummaries.length === 0 ? (
          <EmptyState
            testID="empty-shared-visits"
            title="No shared visits"
            body="When your parent shares a summary, it will appear here."
          />
        ) : (
          sharedSummaries.map((summary) => (
            <TouchableOpacity
              testID={`summary-card-${summary.id}`}
              key={summary.id}
              style={styles.summaryCard}
              onPress={() => handleOpenSummary(summary)}
              activeOpacity={0.82}
            >
              <View style={styles.summaryCardTop}>
                <Body style={styles.summaryCardDate}>
                  {format(new Date(summary.createdAt), 'MMMM d, yyyy')}
                </Body>
                <View style={[styles.statusPill]}>
                  <Caption color={Colors.primary} style={{ fontWeight: '600' }}>
                    Read-only
                  </Caption>
                </View>
              </View>

              {summary.flags.length > 0 && (
                <Caption color={Colors.warning} style={styles.flagNote}>
                  ⚠ {summary.flags.length} item{summary.flags.length > 1 ? 's' : ''} have uncertain details
                </Caption>
              )}

              <Caption color={Colors.textSecondary} style={styles.summaryCardMeta}>
                Shared {formatDistanceToNow(new Date(summary.sharedAt ?? summary.createdAt), { addSuffix: true })}
              </Caption>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  header: {
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  settingsButton: {
    alignSelf: 'flex-end',
    paddingVertical: Spacing.xs,
  },
  settingsText: {
    fontSize: Typography.size.caption,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  greeting: {
    marginTop: Spacing.xs,
    letterSpacing: -0.5,
  },
  tagline: {
    lineHeight: 24,
  },
  tasksBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    gap: Spacing.md,
    ...Shadow.medium,
  },
  tasksIcon: {
    fontSize: 32,
  },
  tasksTitle: {
    color: Colors.surfaceElevated,
    fontWeight: '700',
  },
  tasksChevron: {
    fontSize: 26,
    color: 'rgba(255,255,255,0.6)',
  },
  inlineTasks: {
    marginTop: Spacing.md,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    gap: Spacing.sm,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },
  summaryCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    gap: 6,
    ...Shadow.soft,
  },
  summaryCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryCardDate: {
    fontWeight: '600',
    flex: 1,
  },
  summaryCardMeta: {
    marginTop: 2,
  },
  statusPill: {
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  flagNote: {
    marginTop: 2,
  },
});
