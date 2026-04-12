/**
 * Processing Screen — Aging Parents Plan
 * Source: app-flow-pages-and-roles.md §2 "Processing"
 * design-guidelines.md §9 "Processing state"
 *
 * Rules:
 * - Show progress language (not just a spinner)
 * - Explain what is happening in plain English
 * - Give a fallback if processing is delayed
 * - Navigate automatically to SummaryReview when done
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Animated,
  Easing,
  Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Colors, Spacing, Radius, Typography, Motion } from '../design/tokens';
import { H2, Body, Caption, Button } from '../components/ui';
import { useAppState } from '../state/AppContext';
import { generateSummaryFromInput } from '../services/summaryService';
import { transcribeAudio, TranscriptionError, TRANSCRIPTION_ERROR_MESSAGES } from '../services/transcriptionService';
import { isTranscriptionConfigured, getAIConfigSummary } from '../config/env';
import { RootStackParamList } from '../navigation/types';
import { SECTION_ORDER, CaptureInputType, ProcessingOutcome } from '../contracts/schema';
import { analytics } from '../services/analyticsService';

interface OutcomeDetail {
  title: string;
  message: string;
  emoji?: string;
  primaryAction?: { label: string; onPress: () => void };
  secondaryAction?: { label: string; onPress: () => void };
}

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Processing'>;
  route: RouteProp<RootStackParamList, 'Processing'>;
};

// Messages rotate during generation.
// Voice captures get an extra first phase for transcription.
const VOICE_PROGRESS_MESSAGES = [
  'Listening to your recording…',
  'Reading your notes…',
  'Organizing what happened…',
  'Checking for next steps…',
  'Almost ready…',
];

const TEXT_PROGRESS_MESSAGES = [
  'Reading your notes…',
  'Organizing what happened…',
  'Checking for next steps…',
  'Reviewing medications…',
  'Almost ready…',
];

export default function ProcessingScreen({ navigation, route }: Props) {
  const { visitId, captureInput } = route.params;
  const { state, dispatch } = useAppState();

  const [phaseIndex, setPhaseIndex] = useState(0);
  const [outcome, setOutcome] = useState<ProcessingOutcome>('processing');
  const [outcomeDetail, setOutcomeDetail] = useState<OutcomeDetail | null>(null);
  const [isDelayed, setIsDelayed] = useState(false);
  // retryCount drives re-execution of runPipeline on retry
  const [retryCount, setRetryCount] = useState(0);

  // Pick correct message list based on capture type
  const isVoiceCapture = captureInput.inputType === 'voice';
  const PROGRESS_MESSAGES = isVoiceCapture ? VOICE_PROGRESS_MESSAGES : TEXT_PROGRESS_MESSAGES;

  const pulseAnim = useRef(new Animated.Value(0.6)).current;
  const phaseTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const delayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Gentle pulse animation on the loading indicator
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.6,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulseAnim]);

  // Rotate through progress messages
  useEffect(() => {
    phaseTimer.current = setInterval(() => {
      setPhaseIndex((i) => Math.min(i + 1, PROGRESS_MESSAGES.length - 1));
    }, 2800);
    return () => {
      if (phaseTimer.current) clearInterval(phaseTimer.current);
    };
  }, []);

  // Show "delayed" fallback after 30 seconds
  useEffect(() => {
    delayTimer.current = setTimeout(() => {
      setIsDelayed(true);
    }, 30000);
    return () => {
      if (delayTimer.current) clearTimeout(delayTimer.current);
    };
  }, []);

  // Run transcription (voice) then generation
  useEffect(() => {
    let cancelled = false;

    // Log config on every attempt so failures are traceable in the console
    console.log(`[ProcessingScreen] Starting pipeline. Config: ${getAIConfigSummary()}`);

    // Reset phase index on retry
    setPhaseIndex(0);

    async function runPipeline() {
      const requestId = analytics.startNewRequest();
      const startTime = Date.now();
      let transcriptionDurationMs = 0;
      let generationDurationMs = 0;

      analytics.trackPipelineStarted({
        inputType: captureInput.inputType as CaptureInputType,
        isOffline: captureInput.isOffline,
        language: (captureInput.language as 'en' | 'es') ?? 'en',
        retryCount,
        role: state.currentRole as 'parent' | 'adult_child',
      });

      try {
        let rawText = captureInput.rawText ?? '';

        // ─── Step 1: Transcription (voice captures only) ───
        if (captureInput.inputType === 'voice' && captureInput.rawUri) {
          if (!isTranscriptionConfigured()) {
            throw new TranscriptionError(
              'Transcription is not configured. Add WHISPER_LOCAL_URL or OPENAI_API_KEY to your .env file.',
              'auth'
            );
          }
          const transcript = await transcribeAudio(
            captureInput.rawUri,
            (captureInput.language as 'en' | 'es') ?? 'en'
          );
          if (cancelled) return;
          rawText = transcript;
          transcriptionDurationMs = Date.now() - startTime;
          console.log(`[ProcessingScreen] Transcription complete. Length: ${rawText.length} chars`);
          setPhaseIndex(1);
        }

        // ─── Step 2: LLM summarisation ───
        const generationStartTime = Date.now();
        console.log('[ProcessingScreen] Calling LLM...');
        const result = await generateSummaryFromInput(visitId, {
          rawText,
          language: (captureInput.language as 'en' | 'es') ?? 'en',
        });

        if (cancelled) return;
        generationDurationMs = Date.now() - generationStartTime;
        console.log(`[ProcessingScreen] LLM complete. Sections: ${result.sections.filter(s => !s.isEmpty).length} filled`);

        // Check for fallback/stub
        const isFallback = result.sections.every(s => s.isEmpty);
          if (captureInput.isOffline) {
            dispatch({ type: 'CANCEL_OFFLINE_PROCESSING' });
            dispatch({ 
              type: 'UPDATE_OFFLINE_CAPTURE', 
              captureId: captureInput.id, 
              updates: { lastOutcome: 'fallback_used' } 
            });
          }

          setOutcome('fallback_used');
          setOutcomeDetail({
            title: 'Note captured, but summary failed',
            message: "We've saved your recording, but our AI couldn't generate a summary right now. You can review the raw text yourself.",
            emoji: '📝',
            primaryAction: {
              label: 'Review Raw Text',
              onPress: () => {
                dispatch({ type: 'SET_ACTIVE_SUMMARY', summaryId: visitId });
                navigation.replace('SummaryReview', { summaryId: visitId });
              }
            },
            }
          });

          analytics.trackPipelineCompleted({
            durationMs: Date.now() - startTime,
            transcriptionDurationMs: transcriptionDurationMs || undefined,
            generationDurationMs,
            outcome: 'fallback_used',
            sectionCount: result.sections.length,
            actionItemCount: result.actionItems.length,
            flagCount: result.flags.length,
            role: state.currentRole as 'parent' | 'adult_child',
          });

          return;

        const durationMs = Date.now() - startTime;
        analytics.trackPipelineCompleted({
          durationMs,
          transcriptionDurationMs: transcriptionDurationMs || undefined,
          generationDurationMs,
          outcome: 'success',
          sectionCount: result.sections.length,
          actionItemCount: result.actionItems.length,
          flagCount: result.flags.length,
          role: state.currentRole as 'parent' | 'adult_child',
        });

        const isAssisted = state.currentRole === 'adult_child';

        dispatch({
          type: 'UPDATE_SUMMARY',
          summaryId: visitId,
          updates: {
            status: isAssisted ? 'pending_parent_approval' : 'ready_for_review',
            sections: result.sections,
            actionItems: result.actionItems,
            flags: result.flags,
            lastOutcome: isFallback ? 'fallback_used' : 'success',
          },
        });

        if (captureInput.isOffline) {
          dispatch({ type: 'DEQUEUE_OFFLINE_CAPTURE', captureId: captureInput.id });
        }

        setOutcome('success');

        if (isAssisted) {
           Alert.alert(
               'Sent for review',
               'Your parent needs to review and approve this summary before it is permanently saved.',
               [{ text: 'OK', onPress: () => navigation.navigate('AdultChildHome') }]
           );
        } else {
           dispatch({ type: 'SET_ACTIVE_SUMMARY', summaryId: visitId });
           navigation.replace('SummaryReview', { summaryId: visitId });
        }
      } catch (err) {
        if (cancelled) return;
        console.error('[ProcessingScreen] Pipeline failed:', err);

        let category: ProcessingOutcome = 'retryable_failure';
        let title = 'Something went wrong';
        let detail = "We couldn't finish that summary yet. Your recording is safe. Try again when you're connected.";
        let emoji = '🔌';

        if (err instanceof TranscriptionError) {
          analytics.trackPipelineFailed({
            errorType: 'transcription_error',
            errorCode: err.code,
            errorPhase: 'transcription',
            retryCount,
            role: state.currentRole as 'parent' | 'adult_child',
          });
          detail = TRANSCRIPTION_ERROR_MESSAGES[err.code];
          
          if (err.code === 'auth') {
            category = 'non_retryable_failure';
            title = 'Setup Required';
            emoji = '⚙️';
          } else if (err.code === 'format_error') {
            category = 'non_retryable_failure';
            title = 'Recording Error';
            emoji = '⚠️';
          } else if (err.code === 'no_speech') {
            category = 'non_retryable_failure';
            title = 'Nothing Heard';
            emoji = '🔇';
          }
        } else {
          analytics.trackPipelineFailed({
            errorType: 'llm_generation_error',
            errorPhase: 'generation',
            retryCount,
            role: state.currentRole as 'parent' | 'adult_child',
          });
        }

        if (captureInput.isOffline) {
          dispatch({ type: 'CANCEL_OFFLINE_PROCESSING' });
          dispatch({ 
            type: 'UPDATE_OFFLINE_CAPTURE', 
            captureId: captureInput.id, 
            updates: { lastOutcome: category } 
          });
        }

        setOutcome(category);
        setOutcomeDetail({ title, message: detail, emoji });
      }
    }

    runPipeline();
    return () => { cancelled = true; };
  }, [visitId, captureInput, dispatch, navigation, retryCount]);

  // Error/Fallback state
  if (outcome !== 'processing' && outcome !== 'success') {
    const detail = outcomeDetail;
    const isRetryable = outcome === 'retryable_failure';

    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.surface} />
        <View style={styles.errorContainer} testID="processing-outcome-screen">
          <Text style={styles.errorEmoji}>{detail?.emoji ?? '🔌'}</Text>
          <H2 style={styles.errorTitle}>{detail?.title ?? 'Something went wrong'}</H2>
          <Body color={Colors.textSecondary} style={styles.errorBody}>
            {detail?.message ?? "We couldn't finish that summary yet. Your recording is safe. Try again when you're connected."}
          </Body>

          {detail?.primaryAction ? (
            <Button
              testID="btn-outcome-primary"
              label={detail.primaryAction.label}
              onPress={detail.primaryAction.onPress}
              style={{ marginTop: Spacing.lg }}
            />
          ) : isRetryable ? (
            <Button
              testID="btn-retry"
              label="Try again"
              onPress={() => {
                setOutcome('processing');
                setOutcomeDetail(null);
                setIsDelayed(false);
                setRetryCount(c => c + 1);
              }}
              style={{ marginTop: Spacing.lg }}
            />
          ) : null}

          {detail?.secondaryAction ? (
            <Button
              testID="btn-outcome-secondary"
              label={detail.secondaryAction.label}
              variant="ghost"
              onPress={detail.secondaryAction.onPress}
              style={{ marginTop: Spacing.sm }}
            />
          ) : (
            <Button
              testID="btn-go-home"
              label="Go home — I'll finish later"
              variant="ghost"
              onPress={() => navigation.navigate(state.currentRole === 'adult_child' ? 'AdultChildHome' : 'ParentHome')}
              style={{ marginTop: Spacing.sm }}
            />
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.surface} />
      <View style={styles.container} testID="processing-screen">
        {/* Pulsing indicator — not a clinical spinner */}
        <Animated.View style={[styles.pulsingCircle, { opacity: pulseAnim }]}>
          <Text style={styles.pulsingEmoji}>✦</Text>
        </Animated.View>

        {/* Progress message — reassuring language */}
        <H2 style={styles.phaseTitle} testID="processing-message">
          {PROGRESS_MESSAGES[phaseIndex]}
        </H2>
        <Body color={Colors.textSecondary} style={styles.phaseBody}>
          Building your plain-language summary. This takes about 30–60 seconds.
        </Body>

        {/* Delayed fallback — guide don't blame */}
        {isDelayed && (
          <View style={styles.delayedBanner} testID="processing-delayed">
            <Caption color={Colors.warning} style={{ textAlign: 'center', fontWeight: '600' }}>
              Taking a bit longer than usual. Hang tight — your notes are safe.
            </Caption>
          </View>
        )}

        <Caption color={Colors.textSecondary} style={styles.reassurance}>
          Your capture is saved. You can come back if you need to.
        </Caption>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxl,
    gap: Spacing.lg,
  },
  pulsingCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  pulsingEmoji: {
    fontSize: 44,
    color: Colors.primary,
  },
  phaseTitle: {
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  phaseBody: {
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 300,
  },
  delayedBanner: {
    backgroundColor: Colors.warningLight,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.warning,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  reassurance: {
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxl,
    gap: Spacing.md,
  },
  errorEmoji: {
    fontSize: 56,
    marginBottom: Spacing.md,
  },
  errorTitle: {
    textAlign: 'center',
  },
  errorBody: {
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 300,
  },
});
