import { FontAwesome5 } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppColors } from '@/constants/appColors';
import { useLanguage } from '@/contexts/LanguageContext';

const SUPPORT_CHANNELS = [
  { id: 'zalo', name: 'Zalo', iconType: 'zalo' as const, iconName: '', color: '#FFFFFF' },
  { id: 'line', name: 'Line', iconType: 'fa5' as const, iconName: 'line', color: '#06C755' },
  { id: 'kakao', name: 'Kakao Talk', iconType: 'text' as const, iconName: 'K', color: '#FEE500', iconColor: '#3C1E1E' },
  { id: 'whatsapp', name: 'Whatsapp', iconType: 'fa5' as const, iconName: 'whatsapp', color: '#25D366' },
  { id: 'messenger', name: 'Messenger', iconType: 'fa5' as const, iconName: 'facebook-messenger', color: '#0084FF' },
  { id: 'telegram', name: 'Telegram', iconType: 'fa5' as const, iconName: 'telegram-plane', color: '#26A5E4' },
] as const;

export default function SupportTabScreen() {
  const { language } = useLanguage();
  const isEn = language === 'en';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>{isEn ? 'Support' : 'Hỗ trợ'}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {SUPPORT_CHANNELS.map((item) => (
          <Pressable key={item.id} style={styles.card}>
            <View style={[styles.iconWrap, { backgroundColor: item.color }]}>
              {item.iconType === 'zalo' ? (
                <Text style={styles.zaloText}>Zalo</Text>
              ) : item.iconType === 'fa5' ? (
                <FontAwesome5 name={item.iconName} size={20} color="#fff" />
              ) : (
                <Text style={[styles.textIcon, item.iconColor ? { color: item.iconColor } : undefined]}>{item.iconName}</Text>
              )}
            </View>
            <View style={styles.textWrap}>
              <Text style={styles.cardTitle}>{item.name}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.bg,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: AppColors.text,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 10,
  },
  card: {
    backgroundColor: AppColors.white,
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AppColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zaloText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0A84FF',
  },
  textIcon: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
  },
  textWrap: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: AppColors.text,
  },
  chevron: {
    fontSize: 20,
    color: AppColors.textMuted,
  },
});
