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
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Colors, Spacing, Radius, Typography, Motion } from '../design/tokens';
import { H2, Body, Caption, Button } from '../components/ui';
import { useAppState } from '../state/AppContext';
import { generateSummaryFromInput } from '../services/summaryService';
import { transcribeAudio, TranscriptionError, TRANSCRIPTION_ERROR_MESSAGES } from '../services/transcriptionService';
import { RootStackParamList } from '../navigation/types';
import { SECTION_ORDER } from '../contracts/schema';

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
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDelayed, setIsDelayed] = useState(false);

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

    async function runPipeline() {
      try {
        let rawText = captureInput.rawText ?? '';

        // Step 1: Transcription (voice captures only)
        if (captureInput.inputType === 'voice' && captureInput.rawUri) {
          // Phase index 0 = "Listening to your recording…"
          const transcript = await transcribeAudio(
            captureInput.rawUri,
            (captureInput.language as 'en' | 'es') ?? 'en'
          );
          if (cancelled) return;
          rawText = transcript;
          setPhaseIndex(1); // advance to LLM phases
        }

        // Step 2: LLM summarisation
        const result = await generateSummaryFromInput(visitId, {
          rawText,
          language: (captureInput.language as 'en' | 'es') ?? 'en',
        });

        if (cancelled) return;

        dispatch({
          type: 'UPDATE_SUMMARY',
          summaryId: visitId,
          updates: {
            status: 'ready_for_review',
            sections: result.sections,
            actionItems: result.actionItems,
            flags: result.flags,
          },
        });

        dispatch({ type: 'SET_ACTIVE_SUMMARY', summaryId: visitId });
        navigation.replace('SummaryReview', { summaryId: visitId });
      } catch (err) {
        if (cancelled) return;

        // Transcription errors get specific user messages
        if (err instanceof TranscriptionError) {
          setErrorMessage(TRANSCRIPTION_ERROR_MESSAGES[err.code]);
        } else {
          setErrorMessage(null); // generic message shown in UI
        }
        setHasError(true);
      }
    }

    runPipeline();
    return () => { cancelled = true; };
  }, [visitId, captureInput, dispatch, navigation]);

  // Error state
  if (hasError) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.surface} />
        <View style={styles.errorContainer} testID="processing-error">
          <Text style={styles.errorEmoji}>🔌</Text>
          <H2 style={styles.errorTitle}>Something went wrong</H2>
          <Body color={Colors.textSecondary} style={styles.errorBody}>
            {errorMessage ?? "We couldn't finish that summary yet. Your recording is safe. Try again when you're connected."}
          </Body>
          <Button
            testID="btn-retry"
            label="Try again"
            onPress={() => {
              setHasError(false);
              setErrorMessage(null);
            }}
            style={{ marginTop: Spacing.lg }}
          />
          <Button
            testID="btn-go-home"
            label="Go home — I'll finish later"
            variant="ghost"
            onPress={() => navigation.navigate('ParentHome')}
            style={{ marginTop: Spacing.sm }}
          />
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
