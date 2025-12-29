import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../../styles/global';

const TagInput = ({ onAdd }) => {
  const [value, setValue] = useState('');

  const handleAdd = () => {
    if (!value.trim()) return;
    onAdd(value.trim());
    setValue('');
  };

  return (
    <View style={styles.container}>
      <TextInput
        placeholder="Add a tag (e.g., low-carb)"
        placeholderTextColor={colors.muted}
        value={value}
        onChangeText={setValue}
        style={styles.input}
      />
      <TouchableOpacity onPress={handleAdd} style={styles.addBtn}>
        <Text style={{ color: '#0C1824', fontWeight: '700' }}>Add</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    color: colors.text,
    padding: 12,
    borderRadius: 12,
    marginRight: 8,
  },
  addBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 12,
  },
});

export default TagInput;
