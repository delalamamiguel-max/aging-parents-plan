/**
 * Home Screen — Aging Parents Plan
 * Source: app-flow-pages-and-roles.md §2 "Home"
 * design-guidelines.md §9 "Home / capture entry"
 *
 * Rules:
 * - One dominant CTA: "Capture new visit"
 * - Late-capture CTA visible but secondary
 * - Minimal choices until needed
 * - Parent role: sees all summaries, past visits
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Spacing, Radius, Typography, Shadow } from '../design/tokens';
import { H1, H3, Body, Caption, MicroLabel, Button, Card, EmptyState, Divider } from '../components/ui';
import { OfflineQueueBanner } from '../components/ui/OfflineQueueBanner';
import { useAppState } from '../state/AppContext';
import { VisitSummary, SECTION_LABELS } from '../contracts/schema';
import { RootStackParamList } from '../navigation/types';
import { formatDistanceToNow, format } from 'date-fns';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ParentHome'>;
};

export default function ParentHomeScreen({ navigation }: Props) {
  const { state } = useAppState();
  const recentSummaries = state.summaries.slice(0, 10);

  const handleStartCapture = () => {
    navigation.navigate('Capture');
  };

  const handleLateCapture = () => {
    navigation.navigate('Capture', { isLateCapture: true });
  };

  const handleOpenSummary = (summary: VisitSummary) => {
    navigation.navigate('SummaryReview', { summaryId: summary.id });
  };

  const statusLabel: Record<VisitSummary['status'], string> = {
    draft: 'Draft',
    processing: 'Generating…',
    ready_for_review: 'Ready to review',
    saved_private: 'Saved privately',
    shared: 'Shared',
    revoked: 'Access revoked',
    pending_parent_approval: 'Awaiting your approval',
    rejected: 'Rejected',
  };

  const statusColor: Record<VisitSummary['status'], string> = {
    draft: Colors.textSecondary,
    processing: Colors.info,
    ready_for_review: Colors.accent,
    saved_private: Colors.success,
    shared: Colors.primary,
    revoked: Colors.textSecondary,
    pending_parent_approval: Colors.warning,
    rejected: Colors.error,
  };

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
          <MicroLabel>Aging Parents Plan</MicroLabel>
          <H1 style={styles.greeting}>
            {getGreeting()}
          </H1>
          <Body color={Colors.textSecondary} style={styles.tagline}>
            Capture what happened after your visit, while it is still fresh.
          </Body>
        </View>

        {/* Primary CTA — one dominant action */}
        <TouchableOpacity
          testID="btn-start-capture"
          style={styles.primaryCapture}
          onPress={handleStartCapture}
          activeOpacity={0.88}
        >
          <View style={styles.primaryCaptureInner}>
            <View style={styles.captureIcon}>
              <Text style={styles.captureIconText}>🎙</Text>
            </View>
            <View style={styles.primaryCaptureText}>
              <Text style={styles.primaryCaptureCTA}>Capture new visit</Text>
              <Text style={styles.primaryCaptureSub}>Voice, text, or photo — your choice</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </View>
        </TouchableOpacity>

        {/* Late capture — secondary, visible but not competing */}
        <TouchableOpacity
          testID="btn-late-capture"
          style={styles.lateCapture}
          onPress={handleLateCapture}
          activeOpacity={0.75}
        >
          <Caption color={Colors.textSecondary}>
            Had a visit earlier?{' '}
            <Text style={styles.lateCaptureLink}>Log it now</Text>
          </Caption>
        </TouchableOpacity>

        <Divider style={{ marginTop: Spacing.lg, marginBottom: Spacing.lg }} />

        {/* Offline queue banner shown when there are offline captures */}
        <OfflineQueueBanner />

        {/* Past summaries */}
        <View style={styles.sectionHeader}>
          <H3>Past visits</H3>
          {recentSummaries.length > 0 && (
            <TouchableOpacity
              testID="btn-see-all-visits"
              onPress={() => navigation.navigate('PastVisits')}
            >
              <Caption color={Colors.primary}>See all</Caption>
            </TouchableOpacity>
          )}
        </View>

        {recentSummaries.length === 0 ? (
          <EmptyState
            testID="empty-past-visits"
            title="No visits yet"
            body="After your first visit summary is saved, it will appear here."
          />
        ) : (
          recentSummaries.map((summary) => (
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
                <View style={[styles.statusPill, { borderColor: statusColor[summary.status] }]}>
                  <Caption color={statusColor[summary.status]} style={{ fontWeight: '600' }}>
                    {statusLabel[summary.status]}
                  </Caption>
                </View>
              </View>

              {summary.status === 'pending_parent_approval' && (
                <Caption color={Colors.warning} style={styles.approvalNote}>
                  Captured by {summary.submitterName ?? 'your care partner'} — needs your review
                </Caption>
              )}

              {summary.flags.length > 0 && (
                <Caption color={Colors.warning} style={styles.flagNote}>
                  ⚠ {summary.flags.length} item{summary.flags.length > 1 ? 's' : ''} need verification
                </Caption>
              )}

              <Caption color={Colors.textSecondary} style={styles.summaryCardMeta}>
                {formatDistanceToNow(new Date(summary.createdAt), { addSuffix: true })}
              </Caption>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
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
  greeting: {
    marginTop: Spacing.xs,
    letterSpacing: -0.5,
  },
  tagline: {
    lineHeight: 24,
  },

  // Primary CTA
  primaryCapture: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    ...Shadow.medium,
  },
  primaryCaptureInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  captureIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureIconText: {
    fontSize: 26,
  },
  primaryCaptureText: {
    flex: 1,
    gap: 4,
  },
  primaryCaptureCTA: {
    fontSize: Typography.size.h3,
    fontWeight: '700',
    color: Colors.surfaceElevated,
    letterSpacing: -0.2,
  },
  primaryCaptureSub: {
    fontSize: Typography.size.caption,
    color: 'rgba(255,255,255,0.78)',
    lineHeight: 20,
  },
  chevron: {
    fontSize: 26,
    color: 'rgba(255,255,255,0.6)',
  },

  // Late capture
  lateCapture: {
    alignSelf: 'center',
    marginTop: Spacing.md,
    padding: Spacing.sm,
  },
  lateCaptureLink: {
    color: Colors.primary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },

  // Summary cards
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
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  approvalNote: {
    marginTop: 2,
  },
  flagNote: {
    marginTop: 2,
  },
});
