import { Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '../lib/theme';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'cancel';

type AppButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
};

export function AppButton({ label, onPress, variant = 'primary', disabled = false }: AppButtonProps) {
  const buttonStyleByVariant = {
    primary: styles.primary,
    secondary: styles.secondary,
    ghost: styles.ghost,
    danger: styles.danger,
    cancel: styles.cancel,
  };

  const labelStyleByVariant = {
    primary: styles.primaryLabel,
    secondary: styles.secondaryLabel,
    ghost: styles.ghostLabel,
    danger: styles.dangerLabel,
    cancel: styles.cancelLabel,
  };

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        buttonStyleByVariant[variant],
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <Text style={[styles.label, labelStyleByVariant[variant]]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.secondary,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
  },
  danger: {
    backgroundColor: colors.danger,
  },
  cancel: {
    backgroundColor: colors.surface,
    borderColor: colors.danger,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.45,
  },
  label: {
    fontSize: 14,
    fontWeight: '800',
  },
  primaryLabel: {
    color: colors.primaryText,
  },
  secondaryLabel: {
    color: colors.secondaryText,
  },
  ghostLabel: {
    color: colors.text,
  },
  dangerLabel: {
    color: '#ffffff',
  },
  cancelLabel: {
    color: colors.danger,
  },
});
