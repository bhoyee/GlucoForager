import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import Header from '../components/common/Header';
import Button from '../components/common/Button';
import { globalStyles, colors } from '../styles/global';
import { login as loginApi, signup as signupApi } from '../services/auth';
import { useAuth } from '../context/AuthContext';

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useAuth();

  const handleLogin = async () => {
    const res = await loginApi(email, password);
    if (res.access_token) {
      login(email, res.access_token);
      navigation.replace('Main');
    } else {
      Alert.alert('Login failed', res.detail || 'Check credentials');
    }
  };

  return (
    <View style={globalStyles.screen}>
      <Header title="Login" />
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
      <Button label="Login" onPress={handleLogin} />
      <TouchableOpacity onPress={() => navigation.navigate('Signup')} style={{ marginTop: 12 }}>
        <Text style={{ color: colors.accent }}>No account? Sign up</Text>
      </TouchableOpacity>
    </View>
  );
};

export default LoginScreen;
