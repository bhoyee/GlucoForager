// components/RatingPrompt.js
// The "Enjoying GlucoForager?" card. Mounted once in App.js and opened by
// utils/ratingPrompt.js (maybeShowRatingPrompt) when a happy moment makes it due.
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  DeviceEventEmitter,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/Colors';
import { API_URL } from '../config/api';
import { apiFetch } from '../utils/api';
import { getClientInfo } from '../utils/clientInfo';
import { trackEvent } from '../utils/analytics';
import { RATING_PROMPT_EVENT, markNotReally, markRated, requestStoreReview } from '../utils/ratingPrompt';

export default function RatingPrompt() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState('ask'); // ask | feedback | thanks
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(RATING_PROMPT_EVENT, () => {
      setStep('ask');
      setMessage('');
      setError('');
      setVisible(true);
      trackEvent('rating_prompt_shown');
    });
    return () => sub.remove();
  }, []);

  const close = () => setVisible(false);

  const onYes = async () => {
    trackEvent('rating_prompt_yes');
    setVisible(false);
    await markRated();
    // Let the card close before the store sheet slides up.
    setTimeout(() => void requestStoreReview(), 350);
  };

  const onNotReally = async () => {
    trackEvent('rating_prompt_not_really');
    await markNotReally();
    setStep('feedback');
  };

  const sendFeedback = async () => {
    const text = message.trim();
    if (!text) {
      setError('Please write a few words first.');
      return;
    }
    setSending(true);
    setError('');
    try {
      const token = await AsyncStorage.getItem('userToken');
      const info = getClientInfo();
      const response = await apiFetch(
        `${API_URL}/api/app/feedback`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            source: 'rating_prompt',
            platform: info.platform,
            app_version: info.app_version,
          }),
        },
        { timeoutMs: 12000 }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data?.detail || 'Could not send right now. Please try again.');
        return;
      }
      trackEvent('rating_prompt_feedback_sent');
      setStep('thanks');
    } catch {
      setError('No connection. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.card}>
          {step === 'ask' && (
            <>
              <View style={styles.iconCircle}>
                <Ionicons name="heart" size={28} color={Colors.primary} />
              </View>
              <Text style={styles.title}>Enjoying GlucoForager?</Text>
              <Text style={styles.body}>
                Your answer helps us improve, and helps other people with diabetes find the app.
              </Text>
              <Pressable style={[styles.button, styles.primary]} onPress={onYes} accessibilityRole="button">
                <Text style={styles.primaryText}>Yes, I like it</Text>
              </Pressable>
              <Pressable style={[styles.button, styles.secondary]} onPress={onNotReally} accessibilityRole="button">
                <Text style={styles.secondaryText}>Not really</Text>
              </Pressable>
              <Pressable onPress={close} hitSlop={10} accessibilityRole="button">
                <Text style={styles.later}>Maybe later</Text>
              </Pressable>
            </>
          )}

          {step === 'feedback' && (
            <>
              <Text style={styles.title}>What could be better?</Text>
              <Text style={styles.body}>Tell us what isn't working for you. It goes straight to our team.</Text>
              <TextInput
                style={styles.input}
                value={message}
                onChangeText={(t) => {
                  setMessage(t);
                  if (error) setError('');
                }}
                placeholder="E.g. I'd like more vegetarian recipes"
                placeholderTextColor={Colors.textLight}
                multiline
                maxLength={3000}
                autoFocus
              />
              {!!error && <Text style={styles.error}>{error}</Text>}
              <Pressable
                style={[styles.button, styles.primary, sending && styles.disabled]}
                onPress={sendFeedback}
                disabled={sending}
                accessibilityRole="button"
              >
                {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Send feedback</Text>}
              </Pressable>
              <Pressable onPress={close} hitSlop={10} accessibilityRole="button">
                <Text style={styles.later}>Skip</Text>
              </Pressable>
            </>
          )}

          {step === 'thanks' && (
            <>
              <View style={styles.iconCircle}>
                <Ionicons name="checkmark" size={30} color={Colors.primary} />
              </View>
              <Text style={styles.title}>Thank you</Text>
              <Text style={styles.body}>We read every message and use it to make GlucoForager better.</Text>
              <Pressable style={[styles.button, styles.primary]} onPress={close} accessibilityRole="button">
                <Text style={styles.primaryText}>Done</Text>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 42, 58, 0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 24,
    alignItems: 'stretch',
  },
  iconCircle: {
    alignSelf: 'center',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: `${Colors.primary}18`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 21,
    fontWeight: '800',
    color: Colors.brandNavy,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
    color: Colors.text,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 18,
  },
  button: {
    minHeight: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  primary: { backgroundColor: Colors.primary },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondary: { backgroundColor: `${Colors.primary}12` },
  secondaryText: { color: Colors.primary, fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.7 },
  later: {
    textAlign: 'center',
    color: Colors.textLight,
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 6,
  },
  input: {
    minHeight: 110,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: '#D9E2EC',
    borderRadius: 14,
    padding: 12,
    fontSize: 15,
    color: Colors.text,
    textAlignVertical: 'top',
    marginBottom: 10,
  },
  error: { color: Colors.danger, fontSize: 13, marginBottom: 8, textAlign: 'center' },
});
