import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { useState } from 'react';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { theme } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

interface DateRangePickerProps {
  from: Date;
  to: Date;
  onChange: (range: { from: Date; to: Date }) => void;
}

export function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  const [showFrom, setShowFrom] = useState(false);
  const [showTo, setShowTo] = useState(false);

  const handleFromChange = (_event: DateTimePickerEvent, date?: Date) => {
    setShowFrom(Platform.OS === 'ios');
    if (date) onChange({ from: date, to });
  };

  const handleToChange = (_event: DateTimePickerEvent, date?: Date) => {
    setShowTo(Platform.OS === 'ios');
    if (date) onChange({ from, to: date });
  };

  return (
    <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
      <TouchableOpacity
        onPress={() => setShowFrom(true)}
        style={{
          flex: 1, flexDirection: 'row', alignItems: 'center',
          backgroundColor: theme.bg.surface, borderRadius: theme.radius.sm,
          padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        }}
      >
        <Ionicons name="calendar-outline" size={18} color={theme.text.muted} style={{ marginRight: 8 }} />
        <View>
          <Text style={{ color: theme.text.muted, fontSize: 10, marginBottom: 2 }}>FROM</Text>
          <Text style={{ color: theme.text.primary, fontSize: 14, fontWeight: '600' }}>{format(from, 'dd MMM yyyy')}</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => setShowTo(true)}
        style={{
          flex: 1, flexDirection: 'row', alignItems: 'center',
          backgroundColor: theme.bg.surface, borderRadius: theme.radius.sm,
          padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        }}
      >
        <Ionicons name="calendar-outline" size={18} color={theme.text.muted} style={{ marginRight: 8 }} />
        <View>
          <Text style={{ color: theme.text.muted, fontSize: 10, marginBottom: 2 }}>TO</Text>
          <Text style={{ color: theme.text.primary, fontSize: 14, fontWeight: '600' }}>{format(to, 'dd MMM yyyy')}</Text>
        </View>
      </TouchableOpacity>

      {showFrom && (
        <DateTimePicker value={from} mode="date" display="default" onChange={handleFromChange} maximumDate={to} />
      )}
      {showTo && (
        <DateTimePicker value={to} mode="date" display="default" onChange={handleToChange} minimumDate={from} maximumDate={new Date()} />
      )}
    </View>
  );
}
