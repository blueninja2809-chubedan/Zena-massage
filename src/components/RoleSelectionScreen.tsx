import React from 'react';
import {
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { UserRole } from '@/contexts/UserContext';
import { useLanguage } from '@/contexts/LanguageContext';

const COLORS = {
  primary: '#2196F3',
  primaryDark: '#1565C0',
  primarySoft: '#F8E9EC',
  bg: '#FFF8F9',
  card: '#FFFFFF',
  text: '#3D0D16',
  muted: '#8E5C66',
  border: '#B3D4F0',
  green: '#2D8653',
  greenSoft: '#E8F5EE',
};

interface RoleSelectionScreenProps {
  onSelectRole: (role: UserRole) => void;
}

export default function RoleSelectionScreen({ onSelectRole }: RoleSelectionScreenProps) {
  const { language } = useLanguage();
  const isEn = language === 'en';
  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      <View style={styles.content}>
        <Text style={styles.emoji}>✨</Text>
        <Text style={styles.title}>{isEn ? 'Who are you?' : 'Bạn là ai?'}</Text>
        <Text style={styles.subtitle}>
          {isEn
            ? 'Choose your role so we can show the right interface'
            : 'Chọn vai trò của bạn để chúng tôi hiển thị giao diện phù hợp'}
        </Text>

        <TouchableOpacity
          style={styles.roleCard}
          activeOpacity={0.85}
          onPress={() => onSelectRole('customer')}
        >
          <View style={[styles.roleIconWrap, { backgroundColor: COLORS.primarySoft }]}>
            <Text style={styles.roleIcon}>💆</Text>
          </View>
          <View style={styles.roleTextWrap}>
            <Text style={styles.roleTitle}>{isEn ? 'Customer' : 'Khách hàng'}</Text>
            <Text style={styles.roleDesc}>
              {isEn ? 'Find and book home massage/spa services' : 'Tìm kiếm & đặt lịch massage, spa tại nhà'}
            </Text>
          </View>
          <Text style={styles.arrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.roleCard}
          activeOpacity={0.85}
          onPress={() => onSelectRole('therapist')}
        >
          <View style={[styles.roleIconWrap, { backgroundColor: COLORS.greenSoft }]}>
            <Text style={styles.roleIcon}>👨‍⚕️</Text>
          </View>
          <View style={styles.roleTextWrap}>
            <Text style={styles.roleTitle}>{isEn ? 'Therapist' : 'Kỹ thuật viên'}</Text>
            <Text style={styles.roleDesc}>
              {isEn ? 'Receive bookings, manage income & schedule' : 'Nhận lịch hẹn, quản lý thu nhập & lịch làm việc'}
            </Text>
          </View>
          <Text style={styles.arrow}>→</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  emoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 16,
    width: '100%',
  },
  roleIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleIcon: {
    fontSize: 26,
  },
  roleTextWrap: {
    flex: 1,
    marginLeft: 14,
  },
  roleTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 3,
  },
  roleDesc: {
    fontSize: 13,
    color: COLORS.muted,
    lineHeight: 18,
  },
  arrow: {
    fontSize: 20,
    color: COLORS.muted,
    marginLeft: 8,
  },
});
