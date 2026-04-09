/**
 * Past Visits Screen — Aging Parents Plan
 * Source: app-flow-pages-and-roles.md §2 "Past Visits"
 *
 * Shows all saved summaries for the parent, with status and flag indicators.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  FlatList,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Spacing, Radius, Typography, Shadow } from '../design/tokens';
import { H2, Body, Caption, MicroLabel, EmptyState } from '../components/ui';
import { useAppState } from '../state/AppContext';
import { VisitSummary } from '../contracts/schema';
import { RootStackParamList } from '../navigation/types';
import { format, formatDistanceToNow } from 'date-fns';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'PastVisits'>;
};

const STATUS_LABELS: Record<VisitSummary['status'], string> = {
  draft: 'Draft',
  processing: 'Generating…',
  ready_for_review: 'Ready to review',
  saved_private: 'Saved privately',
  shared: 'Shared',
  revoked: 'Access revoked',
  pending_parent_approval: 'Needs your approval',
  rejected: 'Rejected',
};

const STATUS_COLORS: Record<VisitSummary['status'], string> = {
  draft: Colors.textSecondary,
  processing: Colors.info,
  ready_for_review: Colors.accent,
  saved_private: Colors.success,
  shared: Colors.primary,
  revoked: Colors.textSecondary,
  pending_parent_approval: Colors.warning,
  rejected: Colors.error,
};

export default function PastVisitsScreen({ navigation }: Props) {
  const { state } = useAppState();

  const renderItem = ({ item }: { item: VisitSummary }) => (
    <TouchableOpacity
      testID={`past-visit-${item.id}`}
      style={styles.card}
      onPress={() => navigation.navigate('SummaryReview', { summaryId: item.id })}
      activeOpacity={0.82}
    >
      <View style={styles.cardTop}>
        <Body style={styles.date}>{format(new Date(item.createdAt), 'MMMM d, yyyy')}</Body>
        <View style={[styles.pill, { borderColor: STATUS_COLORS[item.status] }]}>
          <Caption color={STATUS_COLORS[item.status]} style={{ fontWeight: '600' }}>
            {STATUS_LABELS[item.status]}
          </Caption>
        </View>
      </View>

      {item.status === 'pending_parent_approval' && (
        <Caption color={Colors.warning}>
          Captured by {item.submitterName ?? 'your care partner'}
        </Caption>
      )}

      {item.flags.length > 0 && (
        <Caption color={Colors.warning}>
          ⚠ {item.flags.length} item{item.flags.length > 1 ? 's' : ''} need verification
        </Caption>
      )}

      {item.sharedAt && item.status === 'shared' && (
        <Caption color={Colors.textSecondary}>
          Shared {formatDistanceToNow(new Date(item.sharedAt), { addSuffix: true })}
        </Caption>
      )}

      <Caption color={Colors.textSecondary}>
        {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
      </Caption>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.surface} />
      <View style={styles.headerRow}>
        <TouchableOpacity
          testID="btn-back"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <H2 style={styles.title}>Past visits</H2>
      </View>

      <FlatList
        data={state.summaries}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            testID="empty-past-visits"
            title="No past visits"
            body="After your first visit summary is saved, it will appear here."
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  headerRow: {
    padding: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.xs,
  },
  backText: {
    fontSize: Typography.size.body,
    color: Colors.primary,
    fontWeight: '600',
  },
  title: {
    letterSpacing: -0.3,
  },
  list: {
    padding: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xxl,
    gap: Spacing.sm,
  },
  card: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    ...Shadow.soft,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  date: {
    fontWeight: '600',
    flex: 1,
  },
  pill: {
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
});
