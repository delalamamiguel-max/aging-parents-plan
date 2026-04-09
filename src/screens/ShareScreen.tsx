/**
 * Share Screen — Aging Parents Plan
 * Source: app-flow-pages-and-roles.md §2 "Share"; masterplan.md §7.4
 * design-guidelines.md §9 "Share screen"
 *
 * Rules:
 * - Private by default — must make it visible
 * - Parent control is obvious
 * - Contact choice should feel reversible
 * - Sharing is per-visit (one adult child in v1)
 * - No PHI in notification payload
 * - Revocation removes access within 60 seconds
 * - Adult child cannot edit; never bypass review
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Alert,
  Switch,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Colors, Spacing, Radius, Typography, Shadow, TouchTarget } from '../design/tokens';
import { H2, H3, Body, Caption, MicroLabel, Button, Divider } from '../components/ui';
import { useAppState } from '../state/AppContext';
import { NOTIFICATION_COPY } from '../contracts/schema';
import { RootStackParamList } from '../navigation/types';
import { format } from 'date-fns';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Share'>;
  route: RouteProp<RootStackParamList, 'Share'>;
};

export default function ShareScreen({ navigation, route }: Props) {
  const { summaryId } = route.params;
  const { state, dispatch } = useAppState();

  const summary = state.summaries.find((s) => s.id === summaryId);
  const link = state.link;
  const isAlreadyShared = summary?.status === 'shared';
  const isRevoked = summary?.status === 'revoked';

  const [isSharing, setIsSharing] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);

  // ─── Share action ──────────────────────────────────────────────────────────

  const handleShare = async () => {
    if (!link) {
      Alert.alert(
        'No care partner linked',
        'You do not have a care partner linked yet. Go to Settings to add one.',
        [
          { text: 'Go to settings', onPress: () => navigation.navigate('Settings') },
          { text: 'Not now' },
        ]
      );
      return;
    }

    Alert.alert(
      `Share with ${link.adultChildName}?`,
      `${link.adultChildName} will receive a notification and can view this summary. They cannot edit it. You can revoke access any time.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Share',
          onPress: async () => {
            setIsSharing(true);
            const sharedAt = new Date().toISOString();

            // In Sprint 2: call push notification service here
            // No PHI in the notification payload
            dispatch({ type: 'SHARE_SUMMARY', summaryId, sharedAt });

            setIsSharing(false);

            Alert.alert(
              `Shared with ${link.adultChildName}`,
              'They will receive a notification shortly. You can revoke access any time.',
              [{ text: 'Done', onPress: () => navigation.navigate('ParentHome') }]
            );
          },
        },
      ]
    );
  };

  // ─── Revoke action ─────────────────────────────────────────────────────────

  const handleRevoke = () => {
    Alert.alert(
      'Revoke access?',
      `${link?.adultChildName ?? 'Your care partner'} will no longer be able to view this summary. This takes effect immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            setIsRevoking(true);
            const revokedAt = new Date().toISOString();
            dispatch({ type: 'REVOKE_SUMMARY', summaryId, revokedAt });
            setIsRevoking(false);
            Alert.alert(
              'Access revoked',
              `${link?.adultChildName ?? 'Your care partner'} can no longer view this summary.`,
              [{ text: 'OK' }]
            );
          },
        },
      ]
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.surface} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            testID="btn-back"
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Text style={styles.backText}>‹ Back</Text>
          </TouchableOpacity>
          <H2 style={styles.title}>Share this summary</H2>
          <Body color={Colors.textSecondary} style={styles.subtitle}>
            Your summary is private by default. Sharing is your choice, for each visit.
          </Body>
        </View>

        {/* Privacy status — always visible */}
        <View style={styles.privacyCard} testID="privacy-status-card">
          <View style={styles.privacyRow}>
            <View style={styles.lockIcon}>
              <Text style={styles.lockEmoji}>
                {isAlreadyShared ? '🔓' : isRevoked ? '🔒' : '🔒'}
              </Text>
            </View>
            <View style={styles.privacyText}>
              <Body style={{ fontWeight: '700' }}>
                {isAlreadyShared
                  ? `Shared with ${link?.adultChildName ?? 'your care partner'}`
                  : isRevoked
                  ? 'Access was revoked'
                  : 'Private — only you can see this'}
              </Body>
              <Caption color={Colors.textSecondary}>
                {isAlreadyShared
                  ? `Shared ${summary?.sharedAt ? format(new Date(summary.sharedAt), 'MMM d') : 'recently'}`
                  : isRevoked
                  ? `Revoked ${summary?.revokedAt ? format(new Date(summary.revokedAt), 'MMM d') : 'recently'}`
                  : 'Sharing off — visible only to you'}
              </Caption>
            </View>
          </View>
        </View>

        {/* Linked care partner */}
        <View style={styles.contactSection}>
          <MicroLabel style={{ marginBottom: Spacing.sm }}>Your care partner</MicroLabel>
          {link ? (
            <View style={styles.contactCard} testID="linked-contact-card">
              <View style={styles.contactAvatar}>
                <Text style={styles.contactInitial}>
                  {link.adultChildName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.contactInfo}>
                <Body style={{ fontWeight: '600' }}>{link.adultChildName}</Body>
                <Caption color={Colors.textSecondary}>
                  {link.status === 'active' ? 'Linked — can receive shares' : 'Link revoked'}
                </Caption>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              testID="btn-add-care-partner"
              style={styles.addContactCard}
              onPress={() => navigation.navigate('Settings')}
              activeOpacity={0.82}
            >
              <Body color={Colors.primary} style={{ fontWeight: '600' }}>
                + Add a care partner
              </Body>
              <Caption color={Colors.textSecondary} style={{ marginTop: 4, lineHeight: 20 }}>
                Link one adult child who can receive your summaries when you choose to share.
              </Caption>
            </TouchableOpacity>
          )}
        </View>

        {/* What they will see */}
        <View style={styles.whatTheySeCard} testID="what-they-see-card">
          <H3 style={styles.whatTheyTitle}>What they will see</H3>
          <Caption color={Colors.textSecondary} style={styles.whatTheyBody}>
            They will see a read-only version of this summary — the same sections you reviewed. They cannot edit anything.
          </Caption>
          <Caption color={Colors.textSecondary} style={styles.whatTheyBody}>
            The notification they receive contains no health details — just a notice that a summary is ready.
          </Caption>
        </View>

        <Divider />

        {/* Share / revoke actions */}
        {!isAlreadyShared && !isRevoked && (
          <View style={styles.actions}>
            <Button
              testID="btn-share"
              label={link ? `Share with ${link.adultChildName}` : 'Share (no care partner linked)'}
              onPress={handleShare}
              isLoading={isSharing}
              isDisabled={!link || link.status !== 'active'}
            />
            <Button
              testID="btn-skip-sharing"
              label="Keep it private"
              variant="secondary"
              onPress={() => {
                dispatch({ type: 'SET_SUMMARY_STATUS', summaryId, status: 'saved_private' });
                navigation.navigate('ParentHome');
              }}
            />
          </View>
        )}

        {isAlreadyShared && (
          <View style={styles.actions} testID="shared-actions">
            <Button
              testID="btn-revoke"
              label="Revoke access"
              variant="destructive"
              onPress={handleRevoke}
              isLoading={isRevoking}
            />
            <Button
              testID="btn-done"
              label="Done"
              variant="secondary"
              onPress={() => navigation.navigate('ParentHome')}
            />
          </View>
        )}

        {isRevoked && (
          <View style={styles.actions} testID="revoked-actions">
            <Button
              testID="btn-re-share"
              label={link ? `Share again with ${link.adultChildName}` : 'Add a care partner first'}
              onPress={handleShare}
              isDisabled={!link || link.status !== 'active'}
            />
            <Button
              testID="btn-done-revoked"
              label="Done"
              variant="ghost"
              onPress={() => navigation.navigate('ParentHome')}
            />
          </View>
        )}

        <Caption
          color={Colors.textSecondary}
          style={styles.privacyNote}
        >
          You control sharing for every visit. You can revoke access any time from your visit history.
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
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
  },
  header: {
    gap: Spacing.sm,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  backText: {
    fontSize: Typography.size.body,
    color: Colors.primary,
    fontWeight: '600',
  },
  title: {
    letterSpacing: -0.3,
  },
  subtitle: {
    lineHeight: 24,
  },

  // Privacy card
  privacyCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    ...Shadow.soft,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  lockIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockEmoji: {
    fontSize: 22,
  },
  privacyText: {
    flex: 1,
    gap: 4,
  },

  // Contact
  contactSection: {
    gap: Spacing.sm,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    ...Shadow.soft,
  },
  contactAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactInitial: {
    fontSize: Typography.size.h3,
    fontWeight: '700',
    color: Colors.surfaceElevated,
  },
  contactInfo: {
    flex: 1,
    gap: 4,
  },
  addContactCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
  },

  // What they see
  whatTheySeCard: {
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  whatTheyTitle: {
    color: Colors.primary,
  },
  whatTheyBody: {
    lineHeight: 20,
  },

  // Actions
  actions: {
    gap: Spacing.sm,
  },
  privacyNote: {
    textAlign: 'center',
    lineHeight: 20,
  },
});
