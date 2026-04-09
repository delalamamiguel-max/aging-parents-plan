/**
 * App Entry — Aging Parents Plan
 * Wraps the navigator in the AppProvider (state + AsyncStorage).
 */

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppProvider } from './src/state/AppContext';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  return (
    <AppProvider>
      <RootNavigator />
      <StatusBar style="dark" />
    </AppProvider>
  );
}
