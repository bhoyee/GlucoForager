import React from 'react';
import { Modal, View, Text, ActivityIndicator } from 'react-native';
import { colors } from '../../styles/global';

const AIProcessingModal = ({ visible, message = 'Processing with AI...' }) => (
  <Modal transparent visible={visible} animationType="fade">
    <View
      style={{
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
      }}
    >
      <View
        style={{
          backgroundColor: colors.surface,
          padding: 20,
          borderRadius: 16,
          alignItems: 'center',
          width: '90%',
        }}
      >
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={{ color: colors.text, marginTop: 12, textAlign: 'center' }}>{message}</Text>
      </View>
    </View>
  </Modal>
);

export default AIProcessingModal;
