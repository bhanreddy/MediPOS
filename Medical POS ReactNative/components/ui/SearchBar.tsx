import { View, TextInput, TouchableOpacity } from 'react-native';
import { theme } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onClear?: () => void;
  testID?: string;
}

export function SearchBar({ value, onChangeText, placeholder = 'Search...', onClear, testID }: SearchBarProps) {
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.bg.surface,
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.08)',
      paddingHorizontal: 12,
      height: 48,
      marginBottom: 12,
    }}>
      <Ionicons name="search-outline" size={20} color={theme.text.muted} style={{ marginRight: 8 }} />
      <TextInput
        testID={testID}
        nativeID={testID}
        style={{ flex: 1, color: theme.text.primary, fontSize: 16 }}
        placeholderTextColor={theme.text.muted}
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        autoCorrect={false}
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => { onChangeText(''); onClear?.(); }}>
          <Ionicons name="close-circle" size={20} color={theme.text.muted} />
        </TouchableOpacity>
      )}
    </View>
  );
}
