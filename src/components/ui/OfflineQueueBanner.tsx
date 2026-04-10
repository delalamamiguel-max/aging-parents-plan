import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Network from 'expo-network';
import { Colors, Spacing, Radius, Typography, TouchTarget } from '../../design/tokens';
import { Caption } from '../ui';
import { useAppState } from '../../state/AppContext';
import { RootStackParamList } from '../../navigation/types';

export function OfflineQueueBanner() {
  const { state, dispatch } = useAppState();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  
  const [isOnline, setIsOnline] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const visibleQueue = state.offlineCaptureQueue.filter(
    (c) => c.id !== state.currentlyProcessingQueueId
  );
  const queueLength = visibleQueue.length;

  // Poll network status to know if we can flush
  useEffect(() => {
    let interval = setInterval(async () => {
      const netState = await Network.getNetworkStateAsync();
      // Also consider manual offline toggle if it exists
      setIsOnline(netState.isConnected === true && !state.isOffline);
    }, 3000);

    return () => clearInterval(interval);
  }, [state.isOffline]);

  if (queueLength === 0) return null;

  const handleProcess = async () => {
    if (!isOnline) return;
    setIsProcessing(true);

    // Get the oldest visible capture
    const captureToProcess = visibleQueue[0];
    
    // Mark as processing instead of immediate dequeue
    dispatch({ type: 'START_OFFLINE_PROCESSING', captureId: captureToProcess.id });
    
    // Change summary status to processing
    dispatch({
      type: 'SET_SUMMARY_STATUS',
      summaryId: captureToProcess.visitId,
      status: 'processing'
    });

    setIsProcessing(false);
    
    // Navigate to processing screen for this specific visit
    navigation.navigate('Processing', {
      visitId: captureToProcess.visitId,
      captureInput: captureToProcess,
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.icon}>{isOnline ? '⏳' : '📡'}</Text>
        <View style={styles.textStack}>
          <Caption color={Colors.textPrimary} style={styles.title}>
            {queueLength} {queueLength === 1 ? 'visit' : 'visits'} waiting to process
          </Caption>
          <Caption color={Colors.textSecondary}>
            {isOnline
              ? 'You are back online. Tap to generate.'
              : 'You are offline. We will save these safely until you reconnect.'}
          </Caption>
        </View>
      </View>

      {isOnline && (
        <TouchableOpacity
          style={[styles.button, isProcessing && styles.buttonDisabled]}
          onPress={handleProcess}
          disabled={isProcessing}
          activeOpacity={0.8}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color={Colors.surfaceElevated} />
          ) : (
            <Text style={styles.buttonText}>Process now</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.warningLight,
    borderWidth: 1,
    borderColor: Colors.warning,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  icon: {
    fontSize: 24,
  },
  textStack: {
    flex: 1,
  },
  title: {
    fontWeight: '600',
  },
  button: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TouchTarget.min,
  },
  buttonDisabled: {
    backgroundColor: Colors.textSecondary,
  },
  buttonText: {
    color: Colors.surfaceElevated,
    fontWeight: '600',
    fontSize: Typography.size.body,
  },
});
