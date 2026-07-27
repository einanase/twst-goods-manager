import { Pressable, StyleSheet, Text, type GestureResponderEvent } from 'react-native';
import { colors } from '../lib/theme';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'cancel';
type ButtonSize = 'normal' | 'compact';

type AppButtonProps = {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  size?: ButtonSize;
};

export function AppButton({ label, onPress, variant = 'primary', disabled = false, size = 'normal' }: AppButtonProps) {
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
      onPress={(event) => {
        event.stopPropagation();
        onPress(event);
      }}
      style={({ pressed }) => [
        styles.button,
        size === 'compact' ? styles.compactButton : null,
        buttonStyleByVariant[variant],
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <Text style={[styles.label, size === 'compact' ? styles.compactLabel : null, labelStyleByVariant[variant]]}>
        {label}
      </Text>
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
  compactButton: {
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
  compactLabel: {
    fontSize: 13,
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
