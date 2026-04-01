import { useLanguage } from '@/contexts/LanguageContext';
import { getActivePromotions } from '@/lib/supabaseService';
import type { Promotion } from '@/lib/types';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const translations = {
  vi: {
    title: 'Ưu đãi',
    subtitle: 'Khuyến mãi dành cho bạn',
    off: 'GIẢM',
    code: 'Mã',
    expires: 'HSD',
    apply: 'Áp dụng',
    copied: 'Đã sao chép!',
    loading: 'Đang tải...',
    noPromos: 'Chưa có ưu đãi nào',
    hotDeal: '🔥 Hot Deal',
    limited: 'Có hạn',
    newUser: 'Người mới',
  },
  en: {
    title: 'Promotions',
    subtitle: 'Special offers for you',
    off: 'OFF',
    code: 'Code',
    expires: 'Exp',
    apply: 'Apply',
    copied: 'Copied!',
    loading: 'Loading...',
    noPromos: 'No promotions available',
    hotDeal: '🔥 Hot Deal',
    limited: 'Limited',
    newUser: 'New User',
  },
};

const COLORS = {
  primary: '#E53935',
  dark: '#C62828',
  bg: '#FFFBFB',
  white: '#fff',
  text: '#1A1A1A',
  subText: '#4B5563',
  accent: '#E53935',
  green: '#C62828',
  greenLight: '#E8F5EE',
  gold: '#F5A623',
  goldLight: '#FFF8E1',
  orange: '#E67E22',
  orangeLight: '#FDF2E9',
  border: '#F0E4E6',
};

type PromoTag = { label: string; color: string; bg: string };

function getPromoTag(promo: Promotion, strings: Record<string, string>): PromoTag | null {
  if (promo.discountPercent >= 50) return { label: strings.hotDeal, color: COLORS.orange, bg: COLORS.orangeLight };
  if (promo.discountPercent >= 30) return { label: strings.limited, color: COLORS.primary, bg: '#FFCDD2' };
  if (promo.code.includes('NEW') || promo.code.includes('INVITE')) return { label: strings.newUser, color: COLORS.green, bg: COLORS.greenLight };
  return null;
}

export default function PromotionsScreen({ onClose }: { onClose?: () => void } = {}) {
  const { language } = useLanguage();
  const router = useRouter();
  const strings = translations[language as keyof typeof translations] || translations.vi;

  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    loadPromotions();
  }, []);

  const loadPromotions = async () => {
    try {
      const data = await getActivePromotions();
      setPromotions(data);
    } catch {
      setPromotions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = (promo: Promotion) => {
    setCopiedId(promo.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const renderPromo = ({ item }: { item: Promotion }) => {
    const tag = getPromoTag(item, strings);
    const isCopied = copiedId === item.id;
    const expiryStr = new Date(item.expiryDate).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US');

    return (
      <View style={styles.card}>
        {/* Left accent strip */}
        <View style={[styles.cardAccent, item.discountPercent >= 40 && { backgroundColor: COLORS.orange }]} />

        <View style={styles.cardInner}>
          {/* Top row: tag + expiry */}
          <View style={styles.cardTopRow}>
            {tag && (
              <View style={[styles.promoTag, { backgroundColor: tag.bg }]}>
                <Text style={[styles.promoTagText, { color: tag.color }]}>{tag.label}</Text>
              </View>
            )}
            <Text style={styles.expiryText}>{strings.expires}: {expiryStr}</Text>
          </View>

          {/* Discount circle + description */}
          <View style={styles.cardBodyRow}>
            <View style={[styles.discountBadge, item.discountPercent >= 40 && { backgroundColor: COLORS.orange }]}>
              <Text style={styles.discountPercent}>{item.discountPercent}%</Text>
              <Text style={styles.discountLabel}>{strings.off}</Text>
            </View>
            <View style={styles.cardTextCol}>
              <Text style={styles.promoDesc} numberOfLines={3}>{item.description}</Text>
            </View>
          </View>

          {/* Bottom: code + apply/copy */}
          <View style={styles.cardBottomRow}>
            <TouchableOpacity style={styles.codeChip} onPress={() => handleCopyCode(item)} activeOpacity={0.7}>
              <Text style={styles.codeLabel}>{strings.code}:</Text>
              <Text style={styles.codeText}>{item.code}</Text>
              <Text style={styles.codeCopyIcon}>{isCopied ? '✓' : '📋'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.applyBtn} activeOpacity={0.85}>
              <Text style={styles.applyBtnText}>{isCopied ? strings.copied : strings.apply}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => onClose ? onClose() : router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleCol}>
          <Text style={styles.headerTitle}>{strings.title}</Text>
          <Text style={styles.headerSubtitle}>{strings.subtitle}</Text>
        </View>
        <View style={styles.headerPromoCount}>
          <Text style={styles.headerPromoCountText}>{promotions.length}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>{strings.loading}</Text>
        </View>
      ) : promotions.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyEmoji}>🎁</Text>
          <Text style={styles.emptyText}>{strings.noPromos}</Text>
        </View>
      ) : (
        <FlatList
          data={promotions}
          keyExtractor={(item) => item.id}
          renderItem={renderPromo}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EDE0E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 20,
    color: COLORS.text,
  },
  headerTitleCol: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
  },
  headerSubtitle: {
    fontSize: 13,
    color: COLORS.subText,
    marginTop: 2,
  },
  headerPromoCount: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerPromoCountText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },

  // List
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 30,
  },

  // Promo Card
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#3B0D14',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  cardAccent: {
    width: 5,
    backgroundColor: COLORS.primary,
  },
  cardInner: {
    flex: 1,
    padding: 14,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  promoTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  promoTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  expiryText: {
    fontSize: 11,
    color: COLORS.subText,
  },
  cardBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 14,
  },
  discountBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discountPercent: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
  },
  discountLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
    marginTop: -2,
  },
  cardTextCol: {
    flex: 1,
  },
  promoDesc: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
    lineHeight: 20,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F5ECED',
    paddingTop: 12,
  },
  codeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8E8EB',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 5,
  },
  codeLabel: {
    fontSize: 11,
    color: COLORS.subText,
  },
  codeText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  codeCopyIcon: {
    fontSize: 12,
    marginLeft: 2,
  },
  applyBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  applyBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },

  // States
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.subText,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 15,
    color: COLORS.subText,
    textAlign: 'center',
  },
});
