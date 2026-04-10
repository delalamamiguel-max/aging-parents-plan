/**
 * Capture Screen — Aging Parents Plan
 * Source: app-flow-pages-and-roles.md §2 "Capture"; masterplan.md §7.1
 * design-guidelines.md §9 "Capture screen"
 *
 * Rules:
 * - Voice-first with text and photo as clear alternatives
 * - Large controls
 * - Reassuring prompt text
 * - No required fields before capture begins
 * - Offline capture saves locally and defers processing
 * - Recording under 30 seconds triggers prompt to add notes
 */

import React, { useState, useRef, useCallback } from 'react';
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
  Platform,
  KeyboardAvoidingView,
  Linking,
} from 'react-native';
import { Audio } from 'expo-av';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Colors, Spacing, Radius, Typography, Shadow, TouchTarget, Motion } from '../design/tokens';
import {
  H2, H3, Body, Caption, MicroLabel, Button, Card, ProcessingState,
} from '../components/ui';
import { generateSummaryFromInput } from '../services/summaryService';
import { RootStackParamList } from '../navigation/types';
import { useAppState } from '../state/AppContext';
import { CaptureInput, CaptureInputType, SECTION_ORDER } from '../contracts/schema';
import * as Network from 'expo-network';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Capture'>;
  route: RouteProp<RootStackParamList, 'Capture'>;
};

type CaptureMode = 'voice' | 'text' | 'photo';

export default function CaptureScreen({ navigation, route }: Props) {
  const isLateCapture = route.params?.isLateCapture ?? false;
  const { state, dispatch } = useAppState();

  const [activeMode, setActiveMode] = useState<CaptureMode>('voice');
  const [textInput, setTextInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartRef = useRef<number>(0);

  // ─── Permission ──────────────────────────────────────────────────────────

  const requestMicPermission = useCallback(async (): Promise<boolean> => {
    const { status } = await Audio.requestPermissionsAsync();
    if (status === 'granted') return true;
    Alert.alert(
      'Microphone access needed',
      'Aging Parents Plan needs your microphone to record your visit. You can enable it in Settings.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]
    );
    return false;
  }, []);

  // ─── Recording controls ───────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    const hasPermission = await requestMicPermission();
    if (!hasPermission) return;

    try {
      // Configure audio session for recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = recording;
      recordingStartRef.current = Date.now();

      setIsRecording(true);
      setIsPaused(false);
      setRecordingSeconds(0);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      console.error('[CaptureScreen] Failed to start recording:', err);
      Alert.alert(
        'Could not start recording',
        'Please try again. If the problem continues, restart the app.'
      );
    }
  }, [requestMicPermission]);

  const pauseRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    try {
      await recordingRef.current.pauseAsync();
      setIsPaused(true);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    } catch (err) {
      console.error('[CaptureScreen] Failed to pause recording:', err);
    }
  }, []);

  const resumeRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    try {
      await recordingRef.current.startAsync(); // resume from paused state
      setIsPaused(false);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      console.error('[CaptureScreen] Failed to resume recording:', err);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);

    let audioUri: string | undefined;

    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
        audioUri = recordingRef.current.getURI() ?? undefined;
        recordingRef.current = null;
        // Reset audio session
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      } catch (err) {
        console.error('[CaptureScreen] Failed to stop recording:', err);
      }
    }

    setIsRecording(false);
    setAudioUri(audioUri);

    // Under 30 seconds: prompt to add notes
    if (recordingSeconds < 30) {
      Alert.alert(
        'Short recording',
        'Your recording was under 30 seconds. Would you like to add any notes before generating your summary?',
        [
          { text: 'Add notes', onPress: () => setActiveMode('text') },
          { text: 'Continue anyway', onPress: () => submitCapture(audioUri) },
        ]
      );
      return;
    }

    submitCapture(audioUri);
  }, [recordingSeconds]);

  // ─── State for audio URI captured from real recording ────────────────────
  const [audioUri, setAudioUri] = useState<string | undefined>();

  // ─── Submission ───────────────────────────────────────────────────────────

  const submitCapture = useCallback(async (capturedAudioUri?: string) => {
    // Must have at least some input (text mode)
    if (activeMode === 'text' && !textInput.trim()) {
      Alert.alert('Nothing to save', 'Please type or speak before submitting.');
      return;
    }

    const visitId = `visit-${Date.now()}`;
    const captureId = `capture-${Date.now()}`;
    const now = new Date().toISOString();

    const networkState = await Network.getNetworkStateAsync();
    const isActuallyOffline = networkState.isConnected === false || state.isOffline;

    const captureInput: CaptureInput = {
      id: captureId,
      visitId,
      inputType: activeMode as CaptureInputType,
      rawText: activeMode === 'text' ? textInput : undefined,
      rawUri: capturedAudioUri ?? audioUri,   // real audio file URI
      language: state.language,              // use global language preference
      isOffline: isActuallyOffline,
      capturedAt: now,
    };

    dispatch({ type: 'SET_PENDING_CAPTURE', capture: captureInput });
    setIsProcessing(true);

    if (isActuallyOffline) {
      // Queue for deferred processing — no data loss
      dispatch({ type: 'QUEUE_OFFLINE_CAPTURE', capture: captureInput });
      dispatch({
        type: 'ADD_SUMMARY',
        summary: {
          id: visitId,
          parentId: state.parentId ?? 'parent-local',
          submitter: state.currentRole as 'parent' | 'adult_child',
          status: 'draft',
          approvalStatus: state.currentRole === 'adult_child' ? 'pending' : 'not_required',
          sections: SECTION_ORDER.map((t) => ({
            sectionType: t,
            content: '',
            sourceType: 'empty',
            isEmpty: true,
          })),
          actionItems: [],
          flags: [],
          captureInputId: captureId,
          createdAt: now,
          updatedAt: now,
        },
      });
      setIsProcessing(false);
      Alert.alert(
        'Saved offline',
        "Your recording is safe. We'll generate the summary as soon as you're connected.",
        [{ text: 'OK', onPress: () => navigation.navigate('ParentHome') }]
      );
      return;
    }

    // Online: navigate to processing screen optimistically
    dispatch({
      type: 'ADD_SUMMARY',
      summary: {
        id: visitId,
        parentId: state.parentId ?? 'parent-local',
        submitter: state.currentRole as 'parent' | 'adult_child',
        status: 'processing',
        approvalStatus: state.currentRole === 'adult_child' ? 'pending' : 'not_required',
        sections: SECTION_ORDER.map((t) => ({
          sectionType: t,
          content: '',
          sourceType: 'empty',
          isEmpty: true,
        })),
        actionItems: [],
        flags: [],
        captureInputId: captureId,
        createdAt: now,
        updatedAt: now,
      },
    });

    dispatch({ type: 'SET_ACTIVE_SUMMARY', summaryId: visitId });
    setIsProcessing(false);
    navigation.navigate('Processing', { visitId, captureInput });
  }, [activeMode, textInput, state.isOffline, state.language, state.parentId, dispatch, navigation, audioUri]);

  // ─── Render ───────────────────────────────────────────────────────────────

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.surface} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
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
            {isLateCapture && (
              <View style={styles.lateCaptureBadge}>
                <Caption color={Colors.accent} style={{ fontWeight: '600' }}>
                  Logging a past visit
                </Caption>
              </View>
            )}
            <H2 style={styles.title}>
              {isLateCapture ? 'What happened at your visit?' : 'Capture your visit'}
            </H2>
            <Body color={Colors.textSecondary} style={styles.subtitle}>
              Tell us what happened — in your own words, at your own pace.
            </Body>
          </View>

          {/* Mode selector */}
          <View style={styles.modeSelector} accessibilityRole="tablist">
            {(['voice', 'text', 'photo'] as CaptureMode[]).map((mode) => {
              const labels = { voice: '🎙 Voice', text: '✏️ Text', photo: '📷 Photo' };
              const isActive = activeMode === mode;
              return (
                <TouchableOpacity
                  key={mode}
                  testID={`mode-${mode}`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  style={[styles.modeTab, isActive && styles.modeTabActive]}
                  onPress={() => setActiveMode(mode)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.modeTabText, isActive && styles.modeTabTextActive]}>
                    {labels[mode]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Voice capture */}
          {activeMode === 'voice' && (
            <View style={styles.voiceContainer} testID="voice-capture">
              {/* Recording indicator */}
              {isRecording ? (
                <View style={styles.recordingActive}>
                  <View style={[styles.recordingDot, isPaused && styles.recordingDotPaused]} />
                  <Text style={styles.recordingTimer}>{formatDuration(recordingSeconds)}</Text>
                  <Caption color={Colors.textSecondary}>
                    {isPaused ? 'Paused — tap Resume to continue' : 'Recording…'}
                  </Caption>
                </View>
              ) : (
                <View style={styles.voicePrompt}>
                  <Text style={styles.micEmoji}>🎙</Text>
                  <Body color={Colors.textSecondary} style={styles.voicePromptText}>
                    Tap Start to record what happened. Speak naturally — the more detail, the better your summary.
                  </Body>
                </View>
              )}

              {/* Recording controls */}
              <View style={styles.recordingControls}>
                {!isRecording ? (
                  <TouchableOpacity
                    testID="btn-start-recording"
                    style={styles.startButton}
                    onPress={startRecording}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.startButtonText}>Start recording</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.activeControls}>
                    <TouchableOpacity
                      testID="btn-pause-resume"
                      style={styles.controlButton}
                      onPress={isPaused ? resumeRecording : pauseRecording}
                      activeOpacity={0.75}
                    >
                      <Caption color={Colors.primary} style={{ fontWeight: '600' }}>
                        {isPaused ? 'Resume' : 'Pause'}
                      </Caption>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID="btn-stop-recording"
                      style={styles.stopButton}
                      onPress={stopRecording}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.stopButtonText}>Done — build summary</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Text capture */}
          {activeMode === 'text' && (
            <View style={styles.textContainer} testID="text-capture">
              <Caption color={Colors.textSecondary} style={styles.textPrompt}>
                Write what happened at your visit. Include medications, next steps, or anything your doctor mentioned.
              </Caption>
              <TextInput
                testID="text-input"
                style={styles.textInput}
                multiline
                value={textInput}
                onChangeText={setTextInput}
                placeholder="For example: Dr. Chen said my blood pressure was stable. She adjusted my lisinopril to 10mg. I need to schedule a follow-up in 6 weeks…"
                placeholderTextColor={Colors.textSecondary}
                textAlignVertical="top"
                autoFocus={false}
                returnKeyType="default"
                accessibilityLabel="Describe your visit"
              />
              <Button
                testID="btn-submit-text"
                label="Build my summary"
                onPress={submitCapture}
                isLoading={isProcessing}
                isDisabled={!textInput.trim()}
                style={styles.submitButton}
              />
            </View>
          )}

          {/* Photo capture */}
          {activeMode === 'photo' && (
            <View style={styles.photoContainer} testID="photo-capture">
              <View style={styles.photoPromptCard}>
                <Text style={styles.photoEmoji}>📷</Text>
                <Body color={Colors.textSecondary} style={styles.photoPromptText}>
                  Take a photo of your discharge paperwork, notes, or prescription bag. We will read it and build your summary.
                </Body>
                <Button
                  testID="btn-take-photo"
                  label="Take a photo"
                  onPress={() => {
                    // expo-image-picker handled in Sprint 2 production
                    Alert.alert('Photo capture', 'Coming in next build — use text entry for now.');
                  }}
                  style={{ marginTop: Spacing.md }}
                />
                <Button
                  testID="btn-pick-photo"
                  label="Choose from library"
                  onPress={() => {
                    Alert.alert('Photo library', 'Coming in next build — use text entry for now.');
                  }}
                  variant="secondary"
                  style={{ marginTop: Spacing.sm }}
                />
              </View>
            </View>
          )}

          {/* Offline indicator */}
          {state.isOffline && (
            <View style={styles.offlineBanner} testID="offline-banner">
              <Caption color={Colors.warning} style={{ fontWeight: '600' }}>
                You are offline — your capture will be saved and processed when you reconnect.
              </Caption>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
  lateCaptureBadge: {
    backgroundColor: Colors.accentLight,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  title: {
    marginTop: Spacing.xs,
  },
  subtitle: {
    lineHeight: 24,
  },

  // Mode selector
  modeSelector: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: Radius.md,
  },
  modeTabActive: {
    backgroundColor: Colors.primary,
  },
  modeTabText: {
    fontSize: Typography.size.caption,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  modeTabTextActive: {
    color: Colors.surfaceElevated,
  },

  // Voice
  voiceContainer: {
    gap: Spacing.lg,
  },
  voicePrompt: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.xl,
  },
  micEmoji: {
    fontSize: 64,
  },
  voicePromptText: {
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 300,
  },
  recordingActive: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
  },
  recordingDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.error,
    // Pulsing effect would be added with Animated in full build
  },
  recordingDotPaused: {
    backgroundColor: Colors.textSecondary,
  },
  recordingTimer: {
    fontSize: 48,
    fontWeight: '700',
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  recordingControls: {
    gap: Spacing.sm,
  },
  startButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.xl,
    paddingVertical: 18,
    alignItems: 'center',
    ...Shadow.medium,
  },
  startButtonText: {
    fontSize: Typography.size.bodyLarge,
    fontWeight: '700',
    color: Colors.surfaceElevated,
  },
  activeControls: {
    gap: Spacing.sm,
  },
  controlButton: {
    alignSelf: 'center',
    padding: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    minHeight: TouchTarget.min,
    justifyContent: 'center',
  },
  stopButton: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.xl,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.primary,
    ...Shadow.soft,
  },
  stopButtonText: {
    fontSize: Typography.size.bodyLarge,
    fontWeight: '700',
    color: Colors.primary,
  },

  // Text
  textContainer: {
    gap: Spacing.md,
  },
  textPrompt: {
    lineHeight: 20,
  },
  textInput: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.borderSoft,
    padding: Spacing.md,
    fontSize: Typography.size.bodyLarge,
    color: Colors.textPrimary,
    minHeight: 200,
    lineHeight: Typography.lineHeight.bodyLarge,
  },
  submitButton: {
    marginTop: Spacing.sm,
  },

  // Photo
  photoContainer: {
    gap: Spacing.md,
  },
  photoPromptCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    ...Shadow.soft,
  },
  photoEmoji: {
    fontSize: 56,
    marginBottom: Spacing.sm,
  },
  photoPromptText: {
    textAlign: 'center',
    lineHeight: 24,
  },

  // Offline
  offlineBanner: {
    backgroundColor: Colors.warningLight,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.warning,
    padding: Spacing.md,
  },
});
