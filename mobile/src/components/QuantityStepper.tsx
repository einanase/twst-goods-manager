import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../lib/theme';

type QuantityStepperProps = {
  value: number;
  onChange: (nextValue: number) => void;
  min?: number;
};

export function QuantityStepper({ value, onChange, min = 0 }: QuantityStepperProps) {
  const [draftValue, setDraftValue] = useState(String(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) {
      setDraftValue(String(value));
    }
  }, [editing, value]);

  function normalizeInput(input: string) {
    return input
      .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
      .replace(/[^\d]/g, '');
  }

  function applyInput(input: string) {
    const normalized = normalizeInput(input);
    if (!normalized) {
      setDraftValue('');
      return;
    }

    const nextValue = Math.max(min, Math.trunc(Number(normalized) || 0));
    setDraftValue(String(nextValue));
    onChange(nextValue);
  }

  function finishEditing() {
    setEditing(false);
    if (!draftValue) {
      setDraftValue(String(min));
      onChange(min);
    }
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        onPress={() => onChange(Math.max(min, value - 1))}
        style={styles.control}
      >
        <Text style={styles.controlText}>-</Text>
      </Pressable>
      <TextInput
        accessibilityLabel="数量を入力"
        inputMode="numeric"
        keyboardType="number-pad"
        onBlur={finishEditing}
        onChangeText={applyInput}
        onFocus={() => {
          setEditing(true);
          setDraftValue(String(value));
        }}
        selectTextOnFocus
        style={styles.valueInput}
        value={editing ? draftValue : String(value)}
      />
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
  valueInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    height: 36,
    minWidth: 52,
    paddingHorizontal: 8,
    textAlign: 'center',
  },
});
