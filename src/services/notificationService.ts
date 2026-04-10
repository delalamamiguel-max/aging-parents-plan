import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { NOTIFICATION_COPY } from '../contracts/schema';

/**
 * Configure how Expo handles notifications locally when the app is foregrounded.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Request permissions for local notifications.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Visit Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  return finalStatus === 'granted';
}

/**
 * Schedule a local reminder.
 * Enforces privacy by ONLY using the pre-approved copy from NOTIFICATION_COPY, not the item content.
 * 
 * @param identifier Custom ID to allow canceling (use actionItemId)
 * @param scheduledAt ISO date of when it should trigger
 */
export async function scheduleLocalReminder(
  identifier: string,
  scheduledAt: string
): Promise<string | null> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return null;

  const triggerDate = new Date(scheduledAt);
  // Do not schedule in the past
  if (triggerDate.getTime() <= Date.now()) {
    console.warn('[NotificationService] Attempted to schedule reminder in the past; skipping.', scheduledAt);
    return null;
  }

  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: NOTIFICATION_COPY.reminderDefault.title,
        body: NOTIFICATION_COPY.reminderDefault.body,
        // We attach the action ID silently so tapping it can open the right task
        data: { actionItemId: identifier },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
      },
      identifier,
    });
  } catch (error) {
    console.error('[NotificationService] Failed to schedule:', error);
    return null;
  }
}

/**
 * Cancel a previously scheduled reminder by its identifier.
 */
export async function cancelReminder(identifier: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch (error) {
    console.error('[NotificationService] Failed to cancel:', error);
  }
}
