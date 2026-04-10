import * as Calendar from 'expo-calendar';
import { Platform, Alert } from 'react-native';

/**
 * Request permissions for the device calendar.
 */
export async function requestCalendarPermissions(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
}

/**
 * Find the default calendar to add an event to.
 */
async function getDefaultCalendarSource(): Promise<Calendar.Source | null> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const defaultCalendars = calendars.filter((each) => each.source.name === 'Default');
  if (defaultCalendars.length > 0) {
    return defaultCalendars[0].source;
  }
  
  if (calendars.length > 0) {
      return calendars[0].source;
  }
  return null;
}

/**
 * Adds an appointment to the default calendar.
 * Returns the created event ID, or null if it failed/declined.
 */
export async function addAppointmentToCalendar(
  title: string,
  startDate: string, // ISO date
  notes?: string
): Promise<string | null> {
  const hasPermission = await requestCalendarPermissions();
  if (!hasPermission) {
    Alert.alert('Permission needed', 'Please allow calendar access in settings to add appointments.');
    return null;
  }

  const defaultCalendarSource = await getDefaultCalendarSource();
  let defaultCalendarId = null;

  if (Platform.OS === 'ios') {
    const defaultCalendar = await Calendar.getDefaultCalendarAsync();
    defaultCalendarId = defaultCalendar.id;
  } else {
    // Android: attempt to find a writable calendar
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const writableCalendars = calendars.filter(c => c.allowsModifications);
    if (writableCalendars.length > 0) {
      defaultCalendarId = writableCalendars[0].id;
    }
  }

  if (!defaultCalendarId && defaultCalendarSource) {
     // Create a new calendar if no default was found but we have a source
      try {
        defaultCalendarId = await Calendar.createCalendarAsync({
            title: 'Aging Parents Plan',
            color: '#15803d',
            entityType: Calendar.EntityTypes.EVENT,
            sourceId: defaultCalendarSource.id,
            source: defaultCalendarSource,
            name: 'AgingParentsPlan',
            ownerAccount: 'personal',
            accessLevel: Calendar.CalendarAccessLevel.OWNER,
        });
      } catch (e) {
          console.error("Failed to create calendar", e);
      }
  }

  if (!defaultCalendarId) {
    Alert.alert('Error', 'Could not find a calendar to add the event to.');
    return null;
  }

  const sDate = new Date(startDate);
  // Default end time to 1 hour after start
  const eDate = new Date(sDate.getTime() + 60 * 60 * 1000);

  try {
    const eventId = await Calendar.createEventAsync(defaultCalendarId, {
      title,
      startDate: sDate,
      endDate: eDate,
      notes: notes ?? 'Added from Aging Parents Plan application.',
      alarms: [{ relativeOffset: -60 }], // Remind 1 hour before
    });
    
    Alert.alert('Added', 'The appointment was added to your calendar.');
    return eventId;
  } catch (error) {
    console.error('[CalendarService] Failed to add event:', error);
    Alert.alert('Error', 'Failed to add appointment to calendar.');
    return null;
  }
}
