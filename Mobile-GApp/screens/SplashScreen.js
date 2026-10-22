// screens/SplashScreen.js
// Loading screen shown while the app restores the session (App.js keeps it up for at least 1.2s).
// The artwork is one flat image, so the scene fades/settles in as a whole and the progress bar
// is drawn on top. If layered artwork (separate bowl/leaves) is supplied later, those layers can
// be animated individually here.
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BACKGROUND = '#FEFDF3'; // matches the artwork's cream background (no flash while it loads)
const TEAL = '#07A393';
const TRACK = '#D0DBD4';

// `continued`: picks up where the first splash left off (no fade-in restart) while Home loads.
export default function SplashScreen({ continued = false }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sceneOpacity = useRef(new Animated.Value(continued ? 1 : 0)).current;
  const sceneScale = useRef(new Animated.Value(continued ? 1 : 1.06)).current;
  const progress = useRef(new Animated.Value(continued ? 0.75 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(sceneOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(sceneScale, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // Fill most of the bar quickly, then creep, so it never looks "done" while still loading.
    Animated.sequence([
      Animated.timing(progress, { toValue: 0.75, duration: continued ? 0 : 1100, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      Animated.timing(progress, { toValue: 0.95, duration: 4000, easing: Easing.linear, useNativeDriver: false }),
    ]).start();
  }, [progress, sceneOpacity, sceneScale]);

  const trackWidth = Math.min(width * 0.45, 280);

  return (
    <View style={styles.container} accessibilityRole="progressbar" accessibilityLabel="Loading GlucoForager">
      <StatusBar style="dark" />
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: sceneOpacity, transform: [{ scale: sceneScale }] }]}>
        <Image
          source={require('../assets/images/loading-screen.jpg')}
          style={{ width, height }}
          resizeMode="cover"
        />
      </Animated.View>
      <View style={[styles.trackWrap, { bottom: insets.bottom + height * 0.07 }]}>
        <View style={[styles.track, { width: trackWidth }]}>
          <Animated.View
            style={[
              styles.fill,
              { width: progress.interpolate({ inputRange: [0, 1], outputRange: [0, trackWidth] }) },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },
  trackWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: TRACK,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: TEAL,
  },
});
