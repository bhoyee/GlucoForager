import { StyleSheet } from 'react-native';

export const colors = {
  primary: '#0FB7A5',
  accent: '#FFB703',
  background: '#0C1824',
  surface: '#13243A',
  text: '#E6F0F2',
  muted: '#A4B3C0',
  danger: '#E45858',
};

export const globalStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  subheading: {
    fontSize: 16,
    color: colors.muted,
    marginBottom: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
  },
  badge: {
    backgroundColor: colors.primary,
    color: '#0C1824',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    fontWeight: '700',
  },
});
