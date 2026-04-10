import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEY, SCHEMA_VERSION } from './constants';
import { PersistedState } from './types';

/**
 * Telemetry hook placeholder for storage operations.
 */
export const emitTelemetry = (event: string, meta?: any) => {
  // Placeholder for future telemetry integration (e.g. Sentry, PostHog)
  console.log(`[Telemetry] ${event}`, meta);
};

/**
 * Migration placeholder for future state schema changes.
 * Currently returns the raw data as-is.
 */
export const migrateState = (raw: any): any => {
  // Logic for future migrations would go here as schema versions increment.
  return raw;
};

/**
 * High-level read wrapper with migration and safety.
 * Returns null if no state exists or or if an error occurs.
 */
export const readState = async (): Promise<PersistedState | null> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      emitTelemetry('storage_read_empty');
      return null;
    }

    const data = JSON.parse(raw);
    const migrated = migrateState(data);

    emitTelemetry('storage_read_success', { version: SCHEMA_VERSION });
    // Initial version assumes direct cast is safe after migration
    return migrated as PersistedState;
  } catch (error) {
    emitTelemetry('storage_read_error', { error: String(error) });
    console.error('[Storage] Failed to read state:', error);
    return null;
  }
};

/**
 * High-level write wrapper for PersistedState.
 */
export const writeState = async (state: PersistedState): Promise<void> => {
  try {
    const json = JSON.stringify(state);
    await AsyncStorage.setItem(STORAGE_KEY, json);
    emitTelemetry('storage_write_success');
  } catch (error) {
    emitTelemetry('storage_write_error', { error: String(error) });
    console.error('[Storage] Failed to write state:', error);
  }
};
