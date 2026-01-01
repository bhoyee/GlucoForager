import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { login as loginApi } from '../services/auth';
import { useAuth } from '../context/AuthContext';

const colors = {
  primary: '#FF6B35',
  primaryHover: '#FF5722',
  link: '#2E3192',
  text: '#333333',
  muted: '#666666',
  mutedLight: '#888888',
  card: '#FFFFFF',
  border: '#E0E0E0',
  bg1: '#FFF9F5',
  bg2: '#FFFFFF',
};

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();

  const validate = () => {
    if (!/\S+@\S+\.\S+/.test(email)) return 'Enter a valid email.';
    if (!password || password.length < 6) return 'Password must be at least 6 characters.';
    return '';
  };

  const handleLogin = async () => {
    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await loginApi(email, password);
      login(email, res.access_token);
      navigation.replace('Main');
    } catch (e) {
      setError(e.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={[colors.bg1, colors.bg2]} style={styles.container}>
      <View style={styles.card}>
        <View style={styles.floatingIcon}>
          <Text style={{ fontSize: 20 }}>🥕</Text>
        </View>
        <View style={styles.logoWrap}>
          <Image source={require('../../assets/icons/app-icon.png')} style={styles.logo} />
          <Text style={styles.title}>AI-Powered Cooking</Text>
          <Text style={styles.subtitle}>Welcome back</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : <View style={{ height: 18 }} />}

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="test@example.com"
            placeholderTextColor={colors.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <View style={{ position: 'relative' }}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••••"
              placeholderTextColor={colors.muted}
              secureTextEntry={!showPassword}
              style={styles.input}
            />
            <TouchableOpacity style={styles.toggle} onPress={() => setShowPassword((s) => !s)}>
              <Text style={{ color: colors.muted }}>{showPassword ? '🙈' : '👁'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.actions}>
          <View style={styles.remember}>
            <View style={styles.checkbox} />
            <Text style={styles.rememberText}>Remember me</Text>
          </View>
          <TouchableOpacity onPress={() => Alert.alert('Reset password', 'Feature coming soon.')}>
            <Text style={styles.link}>Forgot password?</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={[styles.button, loading && styles.buttonLoading]} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Login</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.signup} onPress={() => navigation.navigate('Signup')}>
          <Text style={styles.signupText}>
            No account? <Text style={styles.link}>Sign up</Text>
          </Text>
        </TouchableOpacity>

        <Text style={styles.tagline}>Scan ingredients in seconds</Text>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    width: '92%',
    maxWidth: 400,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    position: 'relative',
  },
  floatingIcon: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#FFF3EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrap: { alignItems: 'center', marginBottom: 12 },
  logo: { width: 64, height: 64, marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '600', color: colors.text },
  subtitle: { fontSize: 14, color: colors.muted },
  error: { color: '#d0342c', fontSize: 13, marginBottom: 8 },
  field: { marginBottom: 10 },
  label: { fontSize: 14, color: '#555', marginBottom: 4 },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.text,
    backgroundColor: '#fff',
  },
  toggle: { position: 'absolute', right: 12, top: 12 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  remember: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
  },
  rememberText: { fontSize: 13, color: colors.muted },
  link: { color: colors.link, fontSize: 14 },
  button: {
    marginTop: 10,
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLoading: { opacity: 0.85 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  signup: { marginTop: 12, alignItems: 'center' },
  signupText: { fontSize: 14, color: colors.text },
  tagline: { marginTop: 8, textAlign: 'center', fontSize: 12, color: colors.mutedLight },
});

export default LoginScreen;
