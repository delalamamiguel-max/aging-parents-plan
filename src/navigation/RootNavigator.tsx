/**
 * Root Navigator — Aging Parents Plan
 * Source: app-flow-pages-and-roles.md §1 "Site Map"
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Colors } from '../design/tokens';
import { RootStackParamList } from './types';

// Parent screens
import ParentHomeScreen from '../screens/ParentHomeScreen';
import CaptureScreen from '../screens/CaptureScreen';
import ProcessingScreen from '../screens/ProcessingScreen';
import SummaryReviewScreen from '../screens/SummaryReviewScreen';
import ReminderSetupScreen from '../screens/ReminderSetupScreen';
import ShareScreen from '../screens/ShareScreen';
import PastVisitsScreen from '../screens/PastVisitsScreen';
import SettingsScreen from '../screens/SettingsScreen';

// Placeholder screens for Sprint 2+
import PlaceholderScreen from '../screens/PlaceholderScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="ParentHome"
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: Colors.surface },
          gestureEnabled: true,
        }}
      >
        {/* Parent journey */}
        <Stack.Screen name="ParentHome" component={ParentHomeScreen} />
        <Stack.Screen name="Capture" component={CaptureScreen} />
        <Stack.Screen
          name="Processing"
          component={ProcessingScreen}
          options={{ gestureEnabled: false }} // don't allow back-swipe during processing
        />
        <Stack.Screen name="SummaryReview" component={SummaryReviewScreen} />
        <Stack.Screen name="ReminderSetup" component={ReminderSetupScreen} />
        <Stack.Screen name="Share" component={ShareScreen} />
        <Stack.Screen name="PastVisits" component={PastVisitsScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />

        {/* Sprint 2: Adult child flows — placeholders */}
        <Stack.Screen
          name="AdultChildHome"
          component={PlaceholderScreen}
          initialParams={{ title: 'Shared summaries', sprint: 2 }}
        />
        <Stack.Screen
          name="SharedSummary"
          component={PlaceholderScreen}
          initialParams={{ title: 'Shared summary view', sprint: 2 }}
        />
        <Stack.Screen
          name="OpenTasks"
          component={PlaceholderScreen}
          initialParams={{ title: 'Open tasks', sprint: 3 }}
        />
        <Stack.Screen
          name="AssistedCapture"
          component={PlaceholderScreen}
          initialParams={{ title: 'Assisted capture', sprint: 4 }}
        />
        <Stack.Screen
          name="ApprovalQueue"
          component={PlaceholderScreen}
          initialParams={{ title: 'Approval queue', sprint: 4 }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
