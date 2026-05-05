import { FontAwesome5 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppColors } from '@/constants/appColors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUser } from '@/contexts/UserContext';

const SUPPORT_CHANNELS = [
  {
    id: 'messenger',
    name: 'Messenger',
    iconType: 'fa5' as const,
    iconName: 'facebook-messenger',
    color: '#0084FF',
    url: 'https://www.facebook.com/zenavietnam/',
  },
  {
    id: 'zalo',
    name: 'Zalo',
    iconType: 'zalo' as const,
    iconName: '',
    color: '#FFFFFF',
    url: 'https://zalo.me/0562373401',
  },
  {
    id: 'telegram',
    name: 'Telegram',
    iconType: 'fa5' as const,
    iconName: 'telegram-plane',
    color: '#26A5E4',
    url: 'https://t.me/zenavietnam',
  },
] as const;

export default function SupportTabScreen() {
  const router = useRouter();
  const { language } = useLanguage();
  const { user } = useUser();
  const isEn = language === 'en';
  const isTherapist = user?.role === 'therapist';
  const openSupportChannel = React.useCallback(async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        isEn ? 'Cannot open link' : 'Không thể mở liên kết',
        isEn
          ? 'Please check your internet connection or open this link manually.'
          : 'Vui lòng kiểm tra kết nối mạng hoặc mở liên kết thủ công.',
      );
    }
  }, [isEn]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>{isEn ? 'Support' : 'Hỗ trợ'}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {SUPPORT_CHANNELS.map((item) => (
          <Pressable key={item.id} style={styles.card} onPress={() => void openSupportChannel(item.url)}>
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

        {isTherapist ? (
          <Pressable style={styles.card} onPress={() => router.push('/therapist-admin-chat')}>
            <View style={[styles.iconWrap, { backgroundColor: AppColors.primary }]}>
              <FontAwesome5 name="user-shield" size={18} color="#fff" />
            </View>
            <View style={styles.textWrap}>
              <Text style={styles.cardTitle}>{isEn ? 'Support Zena' : 'Support Zena'}</Text>
              <Text style={styles.cardSub}>
                {isEn
                  ? 'In-app chat with operations — same thread as the admin panel'
                  : 'Chat nội bộ với bộ phận vận hành — cùng kênh trang quản trị'}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ) : null}
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
  cardSub: {
    fontSize: 12,
    color: AppColors.textMuted,
    marginTop: 2,
  },
  chevron: {
    fontSize: 20,
    color: AppColors.textMuted,
  },
});
