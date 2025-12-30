import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import Header from '../components/common/Header';
import Button from '../components/common/Button';
import { globalStyles, colors } from '../styles/global';
import { signup as signupApi } from '../services/auth';
import { useAuth } from '../context/AuthContext';

const SignUpScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useAuth();

  const handleSignup = async () => {
    const res = await signupApi(email, password);
    if (res.access_token) {
      login(email, res.access_token);
      navigation.replace('Main');
    } else {
      Alert.alert('Signup failed', res.detail || 'Please try again');
    }
  };

  return (
    <View style={globalStyles.screen}>
      <Header title="Create account" />
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor={colors.muted}
        style={{ backgroundColor: colors.surface, color: colors.text, padding: 12, borderRadius: 10, marginBottom: 10 }}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor={colors.muted}
        secureTextEntry
        style={{ backgroundColor: colors.surface, color: colors.text, padding: 12, borderRadius: 10, marginBottom: 10 }}
      />
      <Button label="Create Free Account" onPress={handleSignup} />
      <Text style={{ color: colors.muted, marginTop: 6 }}>Start with 3 free AI scans daily.</Text>
      <TouchableOpacity onPress={() => navigation.navigate('Login')} style={{ marginTop: 12 }}>
        <Text style={{ color: colors.accent }}>Have an account? Login</Text>
      </TouchableOpacity>
    </View>
  );
};

export default SignUpScreen;
