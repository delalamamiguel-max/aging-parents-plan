/**
 * Summary Review Screen — Aging Parents Plan
 * Source: app-flow-pages-and-roles.md §2 "Summary Review"; masterplan.md §7.3
 * design-guidelines.md §9 "Summary review"
 *
 * Rules:
 * - Highest readability standard
 * - Every field supports inline tap-to-edit
 * - Edited content is visibly distinct from AI-generated content
 * - Draft auto-saves on exit
 * - Mandatory review before share
 * - Disclaimer MUST be visible without scrolling
 * - Uncertainty flagged with raw + interpreted phrase
 * - Empty sections are hidden
 * - One-time regeneration allowed with correction prompt
 * - Parent can save privately or proceed to share
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Colors, Spacing, Radius, Typography, Shadow, Motion } from '../design/tokens';
import {
  H2, H3, H4, Body, BodyLarge, Caption, MicroLabel,
  Button, Card, Divider, DisclaimerBanner, UncertaintyFlag, AIGeneratedBadge,
} from '../components/ui';
import { useAppState } from '../state/AppContext';
import {
  SummarySection, SectionType, SECTION_ORDER, SECTION_LABELS,
  REQUIRED_DISCLAIMER, AccuracyFlag,
} from '../contracts/schema';
import { RootStackParamList } from '../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'SummaryReview'>;
  route: RouteProp<RootStackParamList, 'SummaryReview'>;
};

export default function SummaryReviewScreen({ navigation, route }: Props) {
  const { summaryId } = route.params;
  const { state, dispatch } = useAppState();

  const summary = state.summaries.find((s) => s.id === summaryId);

  const [editingSection, setEditingSection] = useState<SectionType | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [regenerateCorrection, setRegenerateCorrection] = useState('');
  const [hasRegenerated, setHasRegenerated] = useState(false); // one-time only
  const [hasReviewed, setHasReviewed] = useState(false);

  if (!summary) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.errorState}>
          <Body color={Colors.textSecondary}>Summary not found.</Body>
          <Button label="Go home" onPress={() => navigation.navigate('ParentHome')} style={{ marginTop: Spacing.md }} />
        </View>
      </SafeAreaView>
    );
  }

  const visibleSections = summary.sections.filter((s) => !s.isEmpty);
  const hasUncertainFlags = summary.flags.length > 0;

  // ─── Edit flow ─────────────────────────────────────────────────────────────

  const startEditing = (section: SummarySection) => {
    setEditingSection(section.sectionType);
    setEditValue(section.content);
  };

  const saveEdit = () => {
    if (!editingSection) return;
    const originalSection = summary.sections.find((s) => s.sectionType === editingSection);
    if (!originalSection) return;

    dispatch({
      type: 'UPDATE_SECTION',
      summaryId,
      section: {
        ...originalSection,
        content: editValue.trim() || originalSection.content,
        sourceType: 'parent_edited',
        editedBy: 'parent',
        isEmpty: !editValue.trim(),
      },
    });
    setEditingSection(null);
  };

  const cancelEdit = () => {
    setEditingSection(null);
    setEditValue('');
  };

  // ─── Regeneration (one-time) ──────────────────────────────────────────────

  const handleRegenerate = () => {
    if (hasRegenerated) {
      Alert.alert(
        'Already regenerated',
        'You have already regenerated this summary once. Please edit the fields directly if you need to make changes.',
        [{ text: 'OK' }]
      );
      return;
    }
    setShowRegenerateModal(true);
  };

  const confirmRegenerate = () => {
    setShowRegenerateModal(false);
    setHasRegenerated(true);
    // In Sprint 2: re-run generation with correction prompt
    Alert.alert(
      'Regeneration queued',
      "We've noted your correction. In the next build, this will regenerate your summary. For now, you can edit fields directly.",
      [{ text: 'OK' }]
    );
  };

  // ─── Save private ──────────────────────────────────────────────────────────

  const savePrivate = async () => {
    setIsSaving(true);
    dispatch({
      type: 'SET_SUMMARY_STATUS',
      summaryId,
      status: 'saved_private',
    });
    dispatch({
      type: 'UPDATE_SUMMARY',
      summaryId,
      updates: { reviewedAt: new Date().toISOString() },
    });
    setIsSaving(false);
    setHasReviewed(true);
    Alert.alert(
      'Saved',
      'Your summary is saved privately. You can share it with your care partner any time from your visit history.',
      [{ text: 'OK', onPress: () => navigation.navigate('ParentHome') }]
    );
  };

  // ─── Proceed to reminder setup ─────────────────────────────────────────────

  const proceedToReminders = () => {
    dispatch({
      type: 'UPDATE_SUMMARY',
      summaryId,
      updates: { reviewedAt: new Date().toISOString() },
    });
    navigation.navigate('ReminderSetup', { summaryId });
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const FlagForSection = ({ section }: { section: SummarySection }) => {
    const flag = summary.flags.find((f) => f.sectionType === section.sectionType);
    if (!flag) return null;
    return (
      <UncertaintyFlag
        rawPhrase={flag.rawPhrase}
        interpretedPhrase={flag.interpretedPhrase}
        testID={`uncertainty-flag-${section.sectionType}`}
      />
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.surface} />

      {/* Disclaimer pinned to top — always visible without scrolling */}
      <View style={styles.disclaimerTop} testID="disclaimer-top">
        <DisclaimerBanner
          text={REQUIRED_DISCLAIMER}
          label="Not a medical record"
          testID="disclaimer-banner"
        />
        {hasUncertainFlags && (
          <View style={styles.flagWarningTop} testID="flag-warning-top">
            <Caption color={Colors.warning} style={{ fontWeight: '600' }}>
              ⚠ {summary.flags.length} item{summary.flags.length > 1 ? 's' : ''} need your verification below
            </Caption>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            testID="btn-back"
            onPress={() => {
              // Draft auto-saves on exit
              dispatch({ type: 'SET_SUMMARY_STATUS', summaryId, status: 'draft' });
              navigation.goBack();
            }}
            style={styles.backButton}
          >
            <Text style={styles.backText}>‹ Back</Text>
          </TouchableOpacity>

          <H2 style={styles.title}>Your visit summary</H2>
          <MicroLabel style={styles.reviewNote}>
            Review each section. Tap any field to edit.
          </MicroLabel>

          {summary.submitter === 'adult_child' && (
            <View style={styles.assistedBadge} testID="assisted-capture-badge">
              <Caption color={Colors.accent} style={{ fontWeight: '600' }}>
                Captured by {summary.submitterName ?? 'your care partner'}
              </Caption>
            </View>
          )}
        </View>

        {/* Summary sections */}
        {SECTION_ORDER.map((sectionType) => {
          const section = summary.sections.find((s) => s.sectionType === sectionType);
          if (!section || section.isEmpty) return null; // hide empty sections

          const isEditing = editingSection === sectionType;

          return (
            <View key={sectionType} style={styles.sectionContainer} testID={`section-${sectionType}`}>
              {/* Section header — label row + badge row to avoid flex squeeze */}
              <View style={styles.sectionHeader}>
                <View style={styles.sectionLabelRow}>
                  <H4 style={styles.sectionLabel}>
                    {SECTION_LABELS[sectionType]}
                  </H4>
                  {section.sourceType === 'parent_edited' && (
                    <View style={styles.editedBadge} testID={`edited-badge-${sectionType}`}>
                      <MicroLabel color={Colors.success} style={{ letterSpacing: 0.3 }}>
                        Edited by you
                      </MicroLabel>
                    </View>
                  )}
                </View>
                {section.sourceType === 'ai_generated' && (
                  <AIGeneratedBadge testID={`ai-badge-${sectionType}`} />
                )}
              </View>

              {/* Uncertainty flag */}
              <FlagForSection section={section} />

              {/* Content — tap to edit */}
              {isEditing ? (
                <View style={styles.editableContainer}>
                  <TextInput
                    testID={`edit-input-${sectionType}`}
                    style={styles.editInput}
                    value={editValue}
                    onChangeText={setEditValue}
                    multiline
                    autoFocus
                    textAlignVertical="top"
                    accessibilityLabel={`Edit ${SECTION_LABELS[sectionType]}`}
                    returnKeyType="default"
                  />
                  <View style={styles.editControls}>
                    <Button
                      testID={`btn-save-edit-${sectionType}`}
                      label="Save"
                      onPress={saveEdit}
                      fullWidth={false}
                      style={styles.editSaveBtn}
                    />
                    <Button
                      testID={`btn-cancel-edit-${sectionType}`}
                      label="Cancel"
                      variant="ghost"
                      onPress={cancelEdit}
                      fullWidth={false}
                    />
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  testID={`tap-to-edit-${sectionType}`}
                  onPress={() => startEditing(section)}
                  style={styles.sectionContent}
                  activeOpacity={0.82}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit: ${SECTION_LABELS[sectionType]}`}
                  accessibilityHint="Tap to edit this section"
                >
                  <Body
                    style={([
                      styles.sectionText,
                      section.sourceType === 'parent_edited' ? styles.sectionTextEdited : null,
                      (section.sectionType === 'medication_changes' && summary.flags.length > 0) ? styles.sectionTextFlagged : null,
                    ] as any)}
                  >
                    {section.content}
                  </Body>
                  <Caption color={Colors.primary} style={styles.tapToEdit}>
                    Tap to edit
                  </Caption>
                </TouchableOpacity>
              )}

              <Divider />
            </View>
          );
        })}

        {/* No content fallback */}
        {visibleSections.length === 0 && (
          <View style={styles.emptySummary} testID="empty-summary">
            <Body color={Colors.textSecondary} style={{ textAlign: 'center', lineHeight: 24 }}>
              We didn't capture enough detail to build sections. Please edit any field to add notes, or try a new capture.
            </Body>
          </View>
        )}

        {/* Regeneration option (one-time) */}
        <TouchableOpacity
          testID="btn-regenerate"
          style={styles.regenerateRow}
          onPress={handleRegenerate}
          activeOpacity={0.75}
        >
          <Caption color={hasRegenerated ? Colors.textSecondary : Colors.primary} style={{ fontWeight: '600' }}>
            {hasRegenerated ? 'Already regenerated — edit fields directly' : 'Something look wrong? Regenerate with a correction'}
          </Caption>
        </TouchableOpacity>

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            testID="btn-set-reminders"
            label="Set reminders & continue"
            onPress={proceedToReminders}
            isLoading={isSaving}
            style={styles.primaryAction}
          />
          <Button
            testID="btn-save-private"
            label="Save privately — no reminders yet"
            variant="secondary"
            onPress={savePrivate}
            isLoading={isSaving}
          />
        </View>
      </ScrollView>

      {/* Regeneration modal */}
      <Modal
        visible={showRegenerateModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowRegenerateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.modalSheet} testID="regenerate-modal">
              <View style={styles.modalHandle} />
              <H3 style={styles.modalTitle}>What needs to be corrected?</H3>
              <Body color={Colors.textSecondary} style={styles.modalSubtitle}>
                Briefly describe what was wrong or missing. We'll use this to rebuild the summary.
              </Body>
              <TextInput
                testID="regenerate-correction-input"
                style={styles.correctionInput}
                value={regenerateCorrection}
                onChangeText={setRegenerateCorrection}
                multiline
                placeholder="For example: The medication dosage was wrong — it should be 10mg not 5mg."
                placeholderTextColor={Colors.textSecondary}
                textAlignVertical="top"
                autoFocus
              />
              <Button
                testID="btn-confirm-regenerate"
                label="Regenerate summary"
                onPress={confirmRegenerate}
                isDisabled={!regenerateCorrection.trim()}
                style={{ marginTop: Spacing.md }}
              />
              <Button
                testID="btn-cancel-regenerate"
                label="Cancel"
                variant="ghost"
                onPress={() => setShowRegenerateModal(false)}
                style={{ marginTop: Spacing.sm }}
              />
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.surface,
  },

  // Disclaimer always above scroll
  disclaimerTop: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.xs,
  },
  flagWarningTop: {
    backgroundColor: Colors.warningLight,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.warning,
  },

  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  header: {
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
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
  reviewNote: {
    color: Colors.textSecondary,
  },
  assistedBadge: {
    backgroundColor: Colors.accentLight,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.accent,
    marginTop: Spacing.xs,
  },

  // Sections
  sectionContainer: {
    gap: Spacing.sm,
  },
  sectionHeader: {
    gap: 4,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  sectionLabel: {
    flex: 1,
    flexShrink: 1,
    color: Colors.textSecondary,
  },
  editedBadge: {
    backgroundColor: Colors.successLight,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  sectionContent: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    gap: Spacing.sm,
  },
  sectionText: {
    lineHeight: Typography.lineHeight.bodyLarge,
    color: Colors.textPrimary,
  },
  sectionTextEdited: {
    color: Colors.primary,
  },
  sectionTextFlagged: {
    color: Colors.warning,
  },
  tapToEdit: {
    fontWeight: '600',
    fontSize: Typography.size.micro,
    letterSpacing: 0.3,
    textDecorationLine: 'underline',
    alignSelf: 'flex-end',
  },

  // Edit mode
  editableContainer: {
    gap: Spacing.sm,
  },
  editInput: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: Colors.primary,
    padding: Spacing.md,
    fontSize: Typography.size.bodyLarge,
    color: Colors.textPrimary,
    minHeight: 100,
    lineHeight: Typography.lineHeight.bodyLarge,
  },
  editControls: {
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'flex-end',
  },
  editSaveBtn: {
    minWidth: 80,
  },

  // Empty summary
  emptySummary: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
  },

  // Regenerate
  regenerateRow: {
    alignSelf: 'center',
    padding: Spacing.sm,
    paddingVertical: Spacing.xs,
  },

  // Actions
  actions: {
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  primaryAction: {},

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlayDark,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.surfaceElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xl,
    gap: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.borderSoft,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.sm,
  },
  modalTitle: {
    letterSpacing: -0.2,
  },
  modalSubtitle: {
    lineHeight: 24,
  },
  correctionInput: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.borderSoft,
    padding: Spacing.md,
    fontSize: Typography.size.body,
    color: Colors.textPrimary,
    minHeight: 100,
    lineHeight: Typography.lineHeight.body,
  },
  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxl,
  },
});
