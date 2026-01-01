import * as ImagePicker from 'expo-image-picker';

export const pickImage = async () => {
  const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, quality: 0.7 });
  if (result.canceled) return null;
  return result.assets?.[0];
};

export const captureImage = async () => {
  const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.7, base64: true });
  if (result.canceled) return null;
  return result.assets?.[0];
};
