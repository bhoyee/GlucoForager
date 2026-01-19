import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { countries } from '../../utils/countries';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { apiFetch } from '../../utils/api';
import { useAuth } from '../../context/authContext';

const genders = ['Male', 'Female', 'Other', 'Prefer not to say'];

const flagFromCode = (code) =>
  code
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));

const countryLabel = (item) => `${flagFromCode(item.code)} ${item.name} (${item.code})`;

export default function PersonalInfoScreen({ navigation }) {
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const headerPaddingTop = Math.max(insets.top, 16);
  const contentBottomPadding = Math.max(insets.bottom + 4, 4);
  const [name, setName] = useState('');
  const [gender, setGender] = useState('');
  const [country, setCountry] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showCountries, setShowCountries] = useState(false);
  const [showGender, setShowGender] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  const resolveCountry = (value) => {
    if (!value) return null;
    const normalized = `${value}`.toLowerCase().trim();
    return (
      countries.find((item) => item.code.toLowerCase() === normalized) ||
      countries.find((item) => item.name.toLowerCase() === normalized) ||
      countries.find((item) => normalized.includes(item.name.toLowerCase())) ||
      null
    );
  };

  const loadProfile = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError('');
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        setIsLoading(false);
        return;
      }
      const response = await apiFetch(
        `${API_URL}${API_ENDPOINTS.USER_PROFILE}`,
        { headers: { Authorization: `Bearer ${token}` } },
        { onUnauthorized: signOut }
      );
      if (response.status === 401) {
        return;
      }
      if (!response.ok) {
        setLoadError('Unable to load your profile.');
        return;
      }
      const data = await response.json();
      setName(data.full_name || '');
      setGender(data.gender || '');
      setEmail(data.email || '');
      setCountry(resolveCountry(data.country));
      setPassword('');
    } catch (error) {
      setLoadError('Unable to load your profile.');
    } finally {
      setIsLoading(false);
    }
  }, [signOut]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const handleUpdate = async () => {
    try {
      if (!email.trim()) {
        Alert.alert('Missing email', 'Please enter a valid email address.');
        return;
      }
      setIsSaving(true);
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Sign in required', 'Please sign in to update your profile.');
        return;
      }
      const payload = {
        full_name: name.trim() || null,
        gender: gender || null,
        country: country?.name || null,
        email: email.trim(),
      };
      if (password.trim()) {
        payload.password = password.trim();
      }
      const response = await apiFetch(
        `${API_URL}${API_ENDPOINTS.USER_PROFILE}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        { onUnauthorized: signOut }
      );
      if (response.status === 401) {
        return;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        Alert.alert('Update failed', data?.detail || 'Please try again.');
        return;
      }
      const data = await response.json();
      setName(data.full_name || '');
      setGender(data.gender || '');
      setEmail(data.email || '');
      setCountry(resolveCountry(data.country));
      setPassword('');
      Alert.alert('Updated', 'Personal info updated successfully.');
    } catch (error) {
      Alert.alert('Error', 'Unable to update your info right now.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Personal Info</Text>
        <View style={{ width: 32 }} />
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding }]}
      >

      <View style={styles.card}>
        {isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading your info...</Text>
          </View>
        ) : null}
        {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}
        <Text style={styles.label}>Full name</Text>
        <TextInput value={name} onChangeText={setName} style={styles.input} />

        <Text style={styles.label}>Gender</Text>
        <TouchableOpacity style={styles.select} onPress={() => setShowGender(true)}>
          <Text style={styles.selectText}>{gender || 'Select gender'}</Text>
          <Ionicons name="chevron-down" size={18} color={Colors.textLight} />
        </TouchableOpacity>

        <Text style={styles.label}>Country</Text>
        <TouchableOpacity style={styles.select} onPress={() => setShowCountries(true)}>
          <Text style={styles.selectText}>
            {country ? countryLabel(country) : 'Select country'}
          </Text>
          <Ionicons name="chevron-down" size={18} color={Colors.textLight} />
        </TouchableOpacity>

        <Text style={styles.label}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          style={styles.input}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
          placeholder="Update password"
        />
      </View>

      <TouchableOpacity
        style={styles.updateButton}
        onPress={handleUpdate}
        disabled={isSaving}
      >
        {isSaving ? (
          <ActivityIndicator size="small" color="white" />
        ) : (
          <>
            <Ionicons name="save-outline" size={18} color="white" />
            <Text style={styles.updateText}>Update</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
        <Ionicons name="log-out-outline" size={18} color={Colors.primary} />
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() =>
          Alert.alert(
            'Delete account?',
            "This action is permanent. You won't be able to get your account back.",
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive' },
            ]
          )
        }
      >
        <Ionicons name="trash-outline" size={18} color={Colors.error} />
        <Text style={styles.deleteText}>Delete account</Text>
      </TouchableOpacity>

      <Modal visible={showCountries} transparent animationType="slide" onRequestClose={() => setShowCountries(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Country</Text>
              <TouchableOpacity onPress={() => setShowCountries(false)}>
                <Ionicons name="close" size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {countries.map((item) => (
                <TouchableOpacity
                  key={item.code}
                  style={styles.countryRow}
                  onPress={() => {
                    setCountry(item);
                    setShowCountries(false);
                  }}
                >
                  <Text style={styles.countryText} numberOfLines={2}>
                    {countryLabel(item)}
                  </Text>
                  {item.code === country?.code && (
                    <Ionicons name="checkmark" size={18} color={Colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showGender} transparent animationType="slide" onRequestClose={() => setShowGender(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Gender</Text>
              <TouchableOpacity onPress={() => setShowGender(false)}>
                <Ionicons name="close" size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>
            {genders.map((item) => (
              <TouchableOpacity
                key={item}
                style={styles.countryRow}
                onPress={() => {
                  setGender(item);
                  setShowGender(false);
                }}
              >
                <Text style={styles.countryText}>{item}</Text>
                {item === gender && <Ionicons name="checkmark" size={18} color={Colors.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
  },
  card: {
    backgroundColor: Colors.surface,
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 20,
  },
  label: {
    fontSize: 14,
    color: Colors.textLight,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.text,
    marginBottom: 14,
  },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 14,
  },
  selectText: {
    fontSize: 16,
    color: Colors.text,
  },
  updateButton: {
    marginTop: 20,
    marginHorizontal: 20,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  updateText: {
    color: 'white',
    fontWeight: '600',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  loadingText: {
    marginLeft: 8,
    color: Colors.textLight,
    fontSize: 13,
  },
  errorText: {
    color: Colors.error,
    fontSize: 13,
    marginBottom: 10,
  },
  logoutButton: {
    marginTop: 20,
    marginHorizontal: 20,
    backgroundColor: '#F1F8E9',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  logoutText: {
    color: Colors.primary,
    fontWeight: '600',
  },
  deleteButton: {
    marginTop: 12,
    marginHorizontal: 20,
    backgroundColor: '#FFF5F5',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  deleteText: {
    color: Colors.error,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  countryRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  countryText: {
    fontSize: 16,
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
});
