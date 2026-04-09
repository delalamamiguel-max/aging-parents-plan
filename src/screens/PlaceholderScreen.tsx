/**
 * Placeholder Screen — marks Sprint 2+ screens
 */

import React from 'react';
import { View, StyleSheet, SafeAreaView } from 'react-native';
import { Colors, Spacing } from '../design/tokens';
import { H3, Body, Caption, Button } from '../components/ui';

interface Params {
  title?: string;
  sprint?: number;
}

export default function PlaceholderScreen({ navigation, route }: any) {
  const params = (route.params ?? {}) as Params;
  const title = params.title ?? 'Coming soon';
  const sprint = params.sprint ?? 2;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <H3 style={{ textAlign: 'center' }}>{title}</H3>
        <Body color={Colors.textSecondary} style={styles.body}>
          This screen is scheduled for Sprint {sprint}.
        </Body>
        <Caption color={Colors.textSecondary} style={styles.caption}>
          The parent-facing capture, review, and sharing flows are available now.
        </Caption>
        <Button
          label="Go back"
          onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('ParentHome')}
          variant="secondary"
          style={{ marginTop: Spacing.lg }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.surface },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxl,
    gap: Spacing.md,
  },
  body: { textAlign: 'center', lineHeight: 24 },
  caption: { textAlign: 'center', lineHeight: 20, maxWidth: 280 },
});
