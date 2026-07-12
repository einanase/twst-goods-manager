import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../lib/theme';

type QuantityStepperProps = {
  value: number;
  onChange: (nextValue: number) => void;
  min?: number;
};

export function QuantityStepper({ value, onChange, min = 0 }: QuantityStepperProps) {
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        onPress={() => onChange(Math.max(min, value - 1))}
        style={styles.control}
      >
        <Text style={styles.controlText}>-</Text>
      </Pressable>
      <Text style={styles.value}>{value}</Text>
      <Pressable accessibilityRole="button" onPress={() => onChange(value + 1)} style={styles.control}>
        <Text style={styles.controlText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  control: {
    alignItems: 'center',
    backgroundColor: colors.secondary,
    borderRadius: 8,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  controlText: {
    color: colors.secondaryText,
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 22,
  },
  value: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    minWidth: 26,
    textAlign: 'center',
  },
});

