/**
 * Settings Screen — Aging Parents Plan
 * Source: app-flow-pages-and-roles.md §2 "Settings"
 *
 * Manages: language, notification preferences, trusted contact, account controls.
 * Parent role only.
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
  Switch,
  Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Spacing, Radius, Typography, Shadow, TouchTarget } from '../design/tokens';
import { H2, H3, Body, Caption, MicroLabel, Button, Divider } from '../components/ui';
import { useAppState } from '../state/AppContext';
import { RootStackParamList } from '../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Settings'>;
};

export default function SettingsScreen({ navigation }: Props) {
  const { state, dispatch } = useAppState();
  const link = state.link;

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [missedVisitReminder, setMissedVisitReminder] = useState(true);
  // Language read from global state so it persists across navigation and reloads
  const language = state.language;

  const handleUnlink = () => {
    if (!link) return;
    Alert.alert(
      `Unlink ${link.adultChildName}?`,
      'They will no longer receive shared summaries. You can add them again any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlink',
          style: 'destructive',
          onPress: () => {
            dispatch({ type: 'SET_LINK', link: null });
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account and all data?',
      'This permanently removes your account, all summaries, and shared access. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete permanently',
          style: 'destructive',
          onPress: () => {
            // In Sprint 2: call backend deletion
            Alert.alert('Account deletion', 'Account deletion will be available in the next build.');
          },
        },
      ]
    );
  };

  const SettingRow = ({
    label,
    description,
    value,
    onValueChange,
    testID,
  }: {
    label: string;
    description?: string;
    value: boolean;
    onValueChange: (v: boolean) => void;
    testID?: string;
  }) => (
    <View style={styles.settingRow} testID={testID}>
      <View style={styles.settingText}>
        <Body style={{ fontWeight: '600' }}>{label}</Body>
        {description && (
          <Caption color={Colors.textSecondary} style={{ lineHeight: 18 }}>{description}</Caption>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: Colors.borderSoft, true: Colors.primary }}
        thumbColor={Colors.surfaceElevated}
        accessibilityLabel={label}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.surface} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            testID="btn-back"
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Text style={styles.backText}>‹ Back</Text>
          </TouchableOpacity>
          <H2>Settings</H2>
        </View>

        {/* Language */}
        <View style={styles.section}>
          <MicroLabel style={styles.sectionLabel}>Language</MicroLabel>
          <View style={styles.languageRow}>
            {(['en', 'es'] as const).map((lang) => (
              <TouchableOpacity
                key={lang}
                testID={`lang-${lang}`}
                style={[styles.langButton, language === lang && styles.langButtonActive]}
                onPress={() => dispatch({ type: 'SET_LANGUAGE', language: lang })}
                activeOpacity={0.82}
              >
                <Caption
                  color={language === lang ? Colors.surfaceElevated : Colors.textPrimary}
                  style={{ fontWeight: '600' }}
                >
                  {lang === 'en' ? '🇺🇸 English' : '🇲🇽 Español'}
                </Caption>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Divider />

        {/* Development: Role Toggle */}
        <View style={styles.section}>
          <MicroLabel style={styles.sectionLabel}>App view mode (Test)</MicroLabel>
          <View style={styles.languageRow}>
            {(['parent', 'adult_child'] as const).map((role) => (
              <TouchableOpacity
                key={role}
                testID={`role-${role}`}
                style={[styles.langButton, state.currentRole === role && styles.langButtonActive]}
                onPress={() => dispatch({ type: 'SET_ROLE', role, id: role === 'parent' ? 'parent-local' : 'child-local' })}
                activeOpacity={0.82}
              >
                <Caption
                  color={state.currentRole === role ? Colors.surfaceElevated : Colors.textPrimary}
                  style={{ fontWeight: '600' }}
                >
                  {role === 'parent' ? 'Parent' : 'Care Partner'}
                </Caption>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Notifications */}
        <View style={styles.section}>
          <MicroLabel style={styles.sectionLabel}>Notifications</MicroLabel>
          <SettingRow
            testID="toggle-notifications"
            label="Enable reminders"
            description="Gentle nudges for follow-up items from your visit."
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
          />
          <SettingRow
            testID="toggle-missed-visit"
            label="Missed visit reminder"
            description={`If we detect you had an appointment, we'll gently ask whether you want to log this visit.`}
            value={missedVisitReminder}
            onValueChange={setMissedVisitReminder}
          />
        </View>

        <Divider />

        {/* Care partner */}
        <View style={styles.section}>
          <MicroLabel style={styles.sectionLabel}>Care partner</MicroLabel>
          {link ? (
            <View style={styles.linkedCard} testID="linked-care-partner">
              <View style={styles.linkedAvatar}>
                <Text style={styles.linkedInitial}>
                  {link.adultChildName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.linkedInfo}>
                <Body style={{ fontWeight: '600' }}>{link.adultChildName}</Body>
                <Caption color={Colors.success}>Linked — can receive shares</Caption>
              </View>
              <TouchableOpacity
                testID="btn-unlink"
                onPress={handleUnlink}
                style={styles.unlinkButton}
              >
                <Caption color={Colors.error} style={{ fontWeight: '600' }}>Unlink</Caption>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              testID="btn-add-care-partner"
              style={styles.addCard}
              onPress={() => {
                // In Sprint 2: linking flow
                Alert.alert(
                  'Add care partner',
                  'The full linking flow arrives in the next build. For now, a demo partner will be added.',
                  [
                    { text: 'Cancel' },
                    {
                      text: 'Add demo partner',
                      onPress: () => {
                        dispatch({
                          type: 'SET_LINK',
                          link: {
                            id: `link-${Date.now()}`,
                            parentId: state.parentId ?? 'parent-local',
                            adultChildId: 'child-demo',
                            adultChildName: 'Alex (demo)',
                            status: 'active',
                            createdAt: new Date().toISOString(),
                          },
                        });
                      },
                    },
                  ]
                );
              }}
              activeOpacity={0.82}
            >
              <Body color={Colors.primary} style={{ fontWeight: '600' }}>+ Add a care partner</Body>
              <Caption color={Colors.textSecondary} style={{ marginTop: 4, lineHeight: 20 }}>
                One adult child can receive summaries you choose to share. They can never edit your summaries.
              </Caption>
            </TouchableOpacity>
          )}
        </View>

        <Divider />

        {/* Privacy and data */}
        <View style={styles.section}>
          <MicroLabel style={styles.sectionLabel}>Privacy & data</MicroLabel>
          <Caption color={Colors.textSecondary} style={styles.privacyNote}>
            Your summaries are stored securely and are never shared with providers, insurers, or third parties without your explicit consent.
          </Caption>
          <Caption color={Colors.textSecondary} style={styles.privacyNote}>
            All summaries default to private. Sharing is your choice, one visit at a time.
          </Caption>
          <Button
            testID="btn-delete-account"
            label="Delete account and all data"
            variant="destructive"
            onPress={handleDeleteAccount}
            style={{ marginTop: Spacing.md }}
          />
        </View>

        {/* App info */}
        <View style={styles.appInfo}>
          <Caption color={Colors.textSecondary}>Aging Parents Plan — MVP</Caption>
          <Caption color={Colors.textSecondary}>Not a medical record. Not medical advice.</Caption>
        </View>
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

  // Sections
  section: {
    gap: Spacing.sm,
  },
  sectionLabel: {
    marginBottom: 4,
  },

  // Language
  languageRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  langButton: {
    flex: 1,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.borderSoft,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: TouchTarget.min,
    justifyContent: 'center',
    backgroundColor: Colors.surfaceElevated,
  },
  langButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },

  // Settings rows
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    minHeight: TouchTarget.min,
  },
  settingText: {
    flex: 1,
    gap: 4,
  },

  // Linked care partner
  linkedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
  },
  linkedAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkedInitial: {
    fontSize: Typography.size.h3,
    fontWeight: '700',
    color: Colors.surfaceElevated,
  },
  linkedInfo: {
    flex: 1,
    gap: 4,
  },
  unlinkButton: {
    padding: Spacing.sm,
    minHeight: TouchTarget.min,
    justifyContent: 'center',
  },
  addCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
  },

  // Privacy
  privacyNote: {
    lineHeight: 20,
  },

  // App info
  appInfo: {
    gap: 4,
    alignItems: 'center',
  },
});
