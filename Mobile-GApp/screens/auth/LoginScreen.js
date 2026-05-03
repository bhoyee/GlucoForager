// screens/auth/LoginScreen.js - UPDATED WITH CORRECT IMPORT
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Image,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../constants/Colors";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../../context/authContext"; // Use the hook instead of useContext directly
import { API_ENDPOINTS, API_URL } from "../../config/api";
import { getClientInfo } from "../../utils/clientInfo";

export default function LoginScreen() {
  const navigation = useNavigation();
  const { signIn } = useAuth(); // Use the hook
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  const inputWrapperStyleFor = useMemo(() => {
    return (field) => [styles.inputWrapper, focusedField === field ? styles.inputWrapperFocused : null];
  }, [focusedField]);

  const handleLogin = async () => {
    // Validation
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      Alert.alert('Error', 'Please enter a valid email');
      return;
    }

    setIsLoading(true);
    
    try {
      const response = await fetch(`${API_URL}${API_ENDPOINTS.LOGIN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, client: getClientInfo() }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || data?.message || 'Login failed. Please try again.');
      }

      await signIn(data.access_token, data.public_id, data.refresh_token, data.profile_completed);

      Alert.alert('Success', data.message || 'Login successful!', [
        { text: 'OK' },
      ]);
    } catch (error) {
      Alert.alert('Error', error.message || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackPress = () => {
    // Go back to onboarding if coming from there, otherwise go back normally
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Onboarding');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={handleBackPress}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={() => navigation.navigate('SignUp')}
            style={styles.headerActionButton}
            activeOpacity={0.85}
          >
            <Text style={styles.headerActionText}>Sign Up</Text>
          </TouchableOpacity>
        </View>

        {/* Logo & Title */}
        <View style={styles.logoContainer}>
          <Image
            source={require("../../assets/logo.png")}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={styles.kicker}>Welcome back</Text>
          <Text style={styles.title}>GlucoForager</Text>
          <Text style={styles.subtitle}>Sign in to continue.</Text>
          {__DEV__ ? <Text style={styles.devApiText}>API: {API_URL}</Text> : null}
        </View>

        {/* Form */}
        <View style={styles.form}>
          <View style={styles.formCard}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Sign in</Text>
              <Text style={styles.formSubtitle}>Access your tips, challenges, and meals.</Text>
            </View>
          {/* Email Input */}
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
                editable={!isLoading}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
              />
            </View>
          </View>

          {/* Password Input */}
          <View style={styles.inputContainer}>
            <View style={styles.passwordLabelRow}>
              <Text style={styles.inputLabel}>Password</Text>
              <TouchableOpacity 
                onPress={() => navigation.navigate('ForgotPassword')}
                disabled={isLoading}
              >
                <Text style={[styles.forgotPasswordText, isLoading && { opacity: 0.5 }]}>
                  Forgot Password?
                </Text>
              </TouchableOpacity>
            </View>
            <View style={inputWrapperStyleFor('password')}>
              <Ionicons name="lock-closed-outline" size={20} color={Colors.textLight} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor={Colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                editable={!isLoading}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
              />
              <TouchableOpacity 
                onPress={() => setShowPassword(!showPassword)}
                disabled={isLoading}
              >
                <Ionicons 
                  name={showPassword ? "eye-off-outline" : "eye-outline"} 
                  size={20} 
                  color={isLoading ? Colors.textMuted : Colors.textLight} 
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Login Button */}
          <TouchableOpacity 
            style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={isLoading ? [Colors.textMuted, Colors.textMuted] : [Colors.primary, Colors.primaryLight]}
              style={styles.loginButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {isLoading ? (
                <View style={styles.loadingContainer}>
                  <Ionicons name="refresh" size={20} color="white" style={styles.loadingIcon} />
                  <Text style={styles.loginButtonText}>Signing In...</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.loginButtonText}>Sign In</Text>
                  <Ionicons name="arrow-forward" size={20} color="white" style={{ marginLeft: 8 }} />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.premiumDetailsLink}
            onPress={() => navigation.navigate('PremiumDetails')}
            disabled={isLoading}
          >
            <Text style={[styles.premiumDetailsText, isLoading && { opacity: 0.5 }]}>
              See Premium details
            </Text>
          </TouchableOpacity>
        </View>
        </View>

        {/* Sign Up Link */}
        <View style={styles.signUpContainer}>
          <Text style={styles.signUpPrompt}>Don't have an account? </Text>
          <TouchableOpacity 
            onPress={() => navigation.navigate('SignUp')}
            disabled={isLoading}
          >
            <Text style={[styles.signUpLink, isLoading && { opacity: 0.5 }]}>
              Create Account
            </Text>
          </TouchableOpacity>
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
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
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
  headerActionButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#F2F4F7',
    borderWidth: 1,
    borderColor: '#EEF1F5',
  },
  headerActionText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  logoContainer: {
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 18,
  },
  logoImage: {
    width: 86,
    height: 86,
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
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textLight,
    textAlign: 'center',
    fontWeight: '600',
  },
  devApiText: {
    marginTop: 10,
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center',
    fontWeight: '700',
  },
  form: {
    paddingHorizontal: 20,
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
  passwordLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  forgotPasswordText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700',
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
  loginButton: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 4,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingIcon: {
    marginRight: 8,
    transform: [{ rotate: '0deg' }],
  },
  loginButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '800',
  },
  signUpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 18,
  },
  premiumDetailsLink: {
    marginTop: 14,
    alignSelf: 'center',
  },
  premiumDetailsText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  signUpPrompt: {
    color: Colors.textLight,
    fontSize: 14,
    fontWeight: '700',
  },
  signUpLink: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '900',
  },
});
