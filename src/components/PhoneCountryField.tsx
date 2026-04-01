import { COUNTRY_DIAL_LIST, type CountryDial } from '@/constants/countryDialData';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

function flagEmoji(cca2: string): string {
  const u = cca2.toUpperCase();
  if (u.length !== 2) return '🌐';
  return String.fromCodePoint(...[...u].map((ch) => 127397 + ch.charCodeAt(0)));
}

export type PhoneCountryFieldProps = {
  countryCode: string;
  callingCode: string;
  nationalNumber: string;
  onCountrySelect: (country: CountryDial) => void;
  onChangeNational: (v: string) => void;
  placeholder?: string;
  editable?: boolean;
};

export function PhoneCountryField({
  countryCode,
  callingCode,
  nationalNumber,
  onCountrySelect,
  onChangeNational,
  placeholder,
  editable = true,
}: PhoneCountryFieldProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase();
    if (!s) return COUNTRY_DIAL_LIST;
    return COUNTRY_DIAL_LIST.filter(
      (c) =>
        c.name.toLowerCase().includes(s) ||
        c.callingCode.includes(s) ||
        c.cca2.toLowerCase().includes(s),
    );
  }, [query]);

  return (
    <View>
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.countryBtn}
          onPress={() => editable && setModalVisible(true)}
          disabled={!editable}
          activeOpacity={0.75}
        >
          <Text style={styles.flag}>{flagEmoji(countryCode)}</Text>
          <Text style={styles.calling}>+{callingCode}</Text>
          <Text style={styles.chev}>▾</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor="#94A3B8"
          keyboardType="phone-pad"
          autoCapitalize="none"
          autoCorrect={false}
          value={nationalNumber}
          onChangeText={onChangeNational}
          editable={editable}
        />
      </View>

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Quốc gia / vùng</Text>
              <TouchableOpacity
                onPress={() => {
                  setModalVisible(false);
                  setQuery('');
                }}
                hitSlop={12}
              >
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.search}
              placeholder="Tìm tên hoặc mã (+84)..."
              placeholderTextColor="#94A3B8"
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
            />
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.cca2}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={20}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.listItem}
                  onPress={() => {
                    onCountrySelect(item);
                    setModalVisible(false);
                    setQuery('');
                  }}
                >
                  <Text style={styles.listFlag}>{flagEmoji(item.cca2)}</Text>
                  <Text style={styles.listName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.listCode}>+{item.callingCode}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    paddingLeft: 6,
    paddingRight: 14,
    minHeight: 54,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  countryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 4,
  },
  flag: {
    fontSize: 22,
  },
  calling: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  chev: {
    fontSize: 12,
    color: '#64748B',
    marginLeft: 2,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: '#0F172A',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '85%',
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  modalClose: { fontSize: 20, color: '#64748B', padding: 4 },
  search: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
    gap: 10,
  },
  listFlag: { fontSize: 22 },
  listName: { flex: 1, fontSize: 16, color: '#111827' },
  listCode: { fontSize: 15, fontWeight: '700', color: '#C62828' },
});
