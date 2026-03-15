// screens/auth/ForgotPasswordScreen.js
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import { API_ENDPOINTS, API_URL } from '../../config/api';

export default function ForgotPasswordScreen() {
  const navigation = useNavigation();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState('request');
  const [focusedField, setFocusedField] = useState(null);

  const inputWrapperStyleFor = useMemo(() => {
    return (field) => [styles.inputWrapper, focusedField === field ? styles.inputWrapperFocused : null];
  }, [focusedField]);

  const requestResetCode = async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      Alert.alert('Error', 'Please enter a valid email');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}${API_ENDPOINTS.FORGOT_PASSWORD}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await safeReadJson(response);
      if (!response.ok) {
        throw new Error(data?.detail || data?.message || 'Failed to send reset code.');
      }

      setStep('verify');
      Alert.alert('Code Sent', data.message || 'Check your email for the 8-digit code.');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to send reset code.');
    } finally {
      setIsLoading(false);
    }
  };

  const submitNewPassword = async () => {
    const trimmedCode = code.trim();
    if (!trimmedCode || trimmedCode.length !== 8) {
      Alert.alert('Error', 'Please enter the 8-digit code.');
      return;
    }

    if (!newPassword || !confirmPassword) {
      Alert.alert('Error', 'Please fill in both password fields.');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}${API_ENDPOINTS.RESET_PASSWORD}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          code: trimmedCode,
          new_password: newPassword,
        }),
      });
      const data = await safeReadJson(response);
      if (!response.ok) {
        const detail = data?.detail;
        const message =
          typeof detail === 'string'
            ? detail
            : detail?.message || data?.message || 'Failed to reset password.';
        throw new Error(message);
      }

      Alert.alert('Success', data.message || 'Password updated successfully.', [
        { text: 'OK', onPress: () => navigation.navigate('Login') },
      ]);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to reset password.');
    } finally {
      setIsLoading(false);
    }
  };

  const safeReadJson = async (response) => {
    const rawText = await response.text().catch(() => '');
    if (!rawText) return {};
    try {
      return JSON.parse(rawText);
    } catch (error) {
      const preview = rawText.slice(0, 120).replace(/\s+/g, ' ');
      console.warn('Non-JSON response:', preview);
      return { detail: 'Unable to process request right now. Please try again.' };
    }
  };

  const handlePrimaryAction = () => {
    if (step === 'request') {
      requestResetCode();
    } else {
      submitNewPassword();
    }
  };

  const title = step === 'request' ? 'Reset Password' : 'Enter Reset Code';
  const subtitle =
    step === 'request'
      ? "Enter your email and we'll send you an 8-digit code."
      : 'Enter the code and your new password.';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* Illustration & Title */}
        <View style={styles.illustrationContainer}>
          <View style={styles.illustration}>
            <Ionicons name="key-outline" size={48} color={Colors.primary} />
          </View>
          <Text style={styles.kicker}>Account recovery</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <View style={styles.formCard}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>{step === 'request' ? 'Send a code' : 'Set a new password'}</Text>
              <Text style={styles.formSubtitle}>
                {step === 'request' ? 'We’ll email you an 8-digit code.' : 'Use the code we emailed you.'}
              </Text>
            </View>
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Email Address</Text>
            <View style={inputWrapperStyleFor('email')}>
              <Ionicons name="mail-outline" size={20} color={Colors.textLight} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={Colors.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading && step === 'request'}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
              />
            </View>
          </View>

          {step === 'verify' && (
            <>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>8-digit Code</Text>
                <View style={inputWrapperStyleFor('code')}>
                  <Ionicons name="keypad-outline" size={20} color={Colors.textLight} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="12345678"
                    placeholderTextColor={Colors.textMuted}
                    value={code}
                    onChangeText={setCode}
                    keyboardType="number-pad"
                    maxLength={8}
                    editable={!isLoading}
                    onFocus={() => setFocusedField('code')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>New Password</Text>
                <View style={inputWrapperStyleFor('newPassword')}>
                  <Ionicons name="lock-closed-outline" size={20} color={Colors.textLight} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter new password"
                    placeholderTextColor={Colors.textMuted}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showPassword}
                    editable={!isLoading}
                    onFocus={() => setFocusedField('newPassword')}
                    onBlur={() => setFocusedField(null)}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} disabled={isLoading}>
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={isLoading ? Colors.textMuted : Colors.textLight}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Confirm New Password</Text>
                <View style={inputWrapperStyleFor('confirmPassword')}>
                  <Ionicons name="lock-closed-outline" size={20} color={Colors.textLight} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Confirm new password"
                    placeholderTextColor={Colors.textMuted}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirmPassword}
                    editable={!isLoading}
                    onFocus={() => setFocusedField('confirmPassword')}
                    onBlur={() => setFocusedField(null)}
                  />
                  <TouchableOpacity
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    disabled={isLoading}
                  >
                    <Ionicons
                      name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={isLoading ? Colors.textMuted : Colors.textLight}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}

          {/* Primary Action */}
          <TouchableOpacity
            style={[styles.resetButton, isLoading && styles.resetButtonDisabled]}
            onPress={handlePrimaryAction}
            disabled={isLoading}
          >
            <LinearGradient
              colors={isLoading ? [Colors.textMuted, Colors.textMuted] : ['#2E8B57', '#48BB78']}
              style={styles.resetButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {isLoading ? (
                <Text style={styles.resetButtonText}>Please wait...</Text>
              ) : (
                <>
                  <Text style={styles.resetButtonText}>
                    {step === 'request' ? 'Send Code' : 'Reset Password'}
                  </Text>
                  <Ionicons name="send-outline" size={20} color="white" style={{ marginLeft: 8 }} />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {step === 'verify' && (
            <TouchableOpacity style={styles.resendLink} onPress={requestResetCode} disabled={isLoading}>
              <Text style={[styles.resendText, isLoading && { opacity: 0.6 }]}>Resend code</Text>
            </TouchableOpacity>
          )}

          {/* Back to Login */}
          <TouchableOpacity style={styles.backToLogin} onPress={() => navigation.navigate('Login')}>
            <Ionicons name="arrow-back" size={16} color={Colors.primary} />
            <Text style={styles.backToLoginText}>Back to Sign In</Text>
          </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 8,
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  illustrationContainer: {
    alignItems: 'center',
    marginBottom: 18,
  },
  illustration: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: `${Colors.primary}12`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  kicker: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: Colors.text,
    marginTop: 4,
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textLight,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
    fontWeight: '600',
  },
  form: {
    marginTop: 20,
  },
  formCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
  },
  formHeader: { marginBottom: 12 },
  formTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  formSubtitle: { marginTop: 4, fontSize: 12, fontWeight: '700', color: Colors.textLight },
  inputContainer: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F4F7',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 16 : 12,
    borderWidth: 1,
    borderColor: '#EEF1F5',
  },
  inputWrapperFocused: {
    borderColor: Colors.primary,
    backgroundColor: '#EFFAF3',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
    padding: 0,
  },
  resetButton: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 4,
  },
  resetButtonDisabled: {
    opacity: 0.7,
  },
  resetButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
  },
  resetButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '800',
  },
  resendLink: {
    alignItems: 'center',
    marginBottom: 20,
  },
  resendText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  backToLogin: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backToLoginText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },
});
