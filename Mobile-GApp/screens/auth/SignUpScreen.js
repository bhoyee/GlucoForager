// screens/auth/SignUpScreen.js - COMPLETE WITH AUTH CONTEXT
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../constants/Colors";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../../context/authContext";
import { API_ENDPOINTS, API_URL } from "../../config/api";
import { getClientInfo } from "../../utils/clientInfo";

export default function SignUpScreen() {
  const navigation = useNavigation();
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();
  const headerPaddingTop = Math.max(insets.top, 16);
  const contentBottomPadding = Math.max(insets.bottom, 16) + 24;
  const [focusedField, setFocusedField] = useState(null);
  
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (field, value) => {
    setFormData({ ...formData, [field]: value });
  };

  const inputWrapperStyleFor = useMemo(() => {
    return (field) => [styles.inputWrapper, focusedField === field ? styles.inputWrapperFocused : null];
  }, [focusedField]);

  const handleSignUp = async () => {
    const { fullName, email, password, confirmPassword } = formData;

    // Validation
    if (!fullName || !email || !password || !confirmPassword) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      Alert.alert("Error", "Please enter a valid email");
      return;
    }

    if (password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}${API_ENDPOINTS.SIGNUP}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, full_name: fullName, client: getClientInfo() }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || data?.message || 'Signup failed. Please try again.');
      }

      await signIn(data.access_token, data.public_id, data.refresh_token, data.profile_completed);
    } catch (error) {
      Alert.alert("Error", error.message || "Signup failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        
        <TouchableOpacity
          onPress={() => navigation.navigate("Login")}
          style={styles.headerActionButton}
          activeOpacity={0.85}
        >
          <Text style={styles.headerActionText}>Sign In</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* Logo & Title */}
        <View style={styles.logoContainer}>
          <Image
            source={require("../../assets/logo.png")}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={styles.kicker}>Create your account</Text>
          <Text style={styles.title}>GlucoForager</Text>
          <Text style={styles.subtitle}>Set your food preferences, then start your 7-day free trial.</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <View style={styles.formCard}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Account details</Text>
              <Text style={styles.formSubtitle}>Your trial is linked securely to this account.</Text>
            </View>
          {/* Full Name */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Full Name</Text>
            <View style={inputWrapperStyleFor("fullName")}>
              <Ionicons name="person-outline" size={20} color={Colors.textLight} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="John Doe"
                placeholderTextColor={Colors.textMuted}
                value={formData.fullName}
                onChangeText={(text) => handleChange("fullName", text)}
                autoCapitalize="words"
                editable={!isLoading}
                onFocus={() => setFocusedField("fullName")}
                onBlur={() => setFocusedField(null)}
              />
            </View>
          </View>

          {/* Email */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Email Address</Text>
            <View style={inputWrapperStyleFor("email")}>
              <Ionicons name="mail-outline" size={20} color={Colors.textLight} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={Colors.textMuted}
                value={formData.email}
                onChangeText={(text) => handleChange("email", text)}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
                onFocus={() => setFocusedField("email")}
                onBlur={() => setFocusedField(null)}
              />
            </View>
          </View>

          {/* Password */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={inputWrapperStyleFor("password")}>
              <Ionicons name="lock-closed-outline" size={20} color={Colors.textLight} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Create a password"
                placeholderTextColor={Colors.textMuted}
                value={formData.password}
                onChangeText={(text) => handleChange("password", text)}
                secureTextEntry={!showPassword}
                editable={!isLoading}
                onFocus={() => setFocusedField("password")}
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
            <Text style={styles.passwordHint}>Must be at least 6 characters</Text>
          </View>

          {/* Confirm Password */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Confirm Password</Text>
            <View style={inputWrapperStyleFor("confirmPassword")}>
              <Ionicons name="lock-closed-outline" size={20} color={Colors.textLight} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Confirm your password"
                placeholderTextColor={Colors.textMuted}
                value={formData.confirmPassword}
                onChangeText={(text) => handleChange("confirmPassword", text)}
                secureTextEntry={!showConfirmPassword}
                editable={!isLoading}
                onFocus={() => setFocusedField("confirmPassword")}
                onBlur={() => setFocusedField(null)}
              />
              <TouchableOpacity 
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                disabled={isLoading}
              >
                <Ionicons 
                  name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} 
                  size={20} 
                  color={isLoading ? Colors.textMuted : Colors.textLight} 
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Terms */}
          <View style={styles.termsContainer}>
            <Text style={styles.termsText}>
              By signing up, you agree to our{" "}
              <Text
                style={styles.termsLink}
                onPress={() => navigation.navigate("Terms")}
                suppressHighlighting
              >
                Terms of Service
              </Text>{" "}
              and{" "}
              <Text
                style={styles.termsLink}
                onPress={() => navigation.navigate("PrivacyPolicy")}
                suppressHighlighting
              >
                Privacy Policy
              </Text>
            </Text>
          </View>

          {/* Sign Up Button */}
          <TouchableOpacity 
            style={[styles.signUpButton, isLoading && styles.signUpButtonDisabled]}
            onPress={handleSignUp}
            disabled={isLoading}
          >
            <LinearGradient
              colors={isLoading ? [Colors.textMuted, Colors.textMuted] : [Colors.primary, Colors.primaryLight]}
              style={styles.signUpButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {isLoading ? (
                <View style={styles.loadingContainer}>
                  <Ionicons name="refresh" size={20} color="white" style={styles.loadingIcon} />
                  <Text style={styles.signUpButtonText}>Creating Account...</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.signUpButtonText}>Create Account</Text>
                  <Ionicons name="arrow-forward" size={20} color="white" style={{ marginLeft: 8 }} />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Login Link */}
          <View style={styles.loginLinkContainer}>
            <Text style={styles.loginPrompt}>Already have an account? </Text>
            <TouchableOpacity 
              onPress={() => navigation.navigate("Login")}
              disabled={isLoading}
            >
              <Text style={[styles.loginLink, isLoading && { opacity: 0.5 }]}>
                Sign In
              </Text>
            </TouchableOpacity>
          </View>
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
  scrollContent: {
    flexGrow: 1,
    paddingTop: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  headerActionButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "#F2F4F7",
    borderWidth: 1,
    borderColor: "#EEF1F5",
  },
  headerActionText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: "800",
  },
  logoContainer: {
    alignItems: "center",
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
    fontWeight: "800",
    color: Colors.textLight,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: Colors.text,
    marginTop: 4,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textLight,
    textAlign: "center",
    fontWeight: "600",
  },
  form: {
    paddingHorizontal: 20,
  },
  formCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
  },
  formHeader: {
    marginBottom: 12,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.text,
  },
  formSubtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "700",
    color: Colors.textLight,
  },
  inputContainer: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F2F4F7",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "ios" ? 16 : 12,
    borderWidth: 1,
    borderColor: "#EEF1F5",
  },
  inputWrapperFocused: {
    borderColor: Colors.primary,
    backgroundColor: "#EFFAF3",
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
  passwordHint: {
    fontSize: 12,
    color: Colors.textLight,
    marginTop: 6,
    marginLeft: 4,
  },
  termsContainer: {
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  termsText: {
    fontSize: 13,
    color: Colors.textLight,
    lineHeight: 20,
    textAlign: "center",
    fontWeight: "600",
  },
  termsLink: {
    color: Colors.primary,
    fontWeight: "600",
  },
  signUpButton: {
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 4,
  },
  signUpButtonDisabled: {
    opacity: 0.7,
  },
  signUpButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingIcon: {
    marginRight: 8,
  },
  signUpButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "800",
  },
  loginLinkContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  loginPrompt: {
    color: Colors.textLight,
    fontSize: 14,
    fontWeight: "600",
  },
  loginLink: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: "600",
  },
});
