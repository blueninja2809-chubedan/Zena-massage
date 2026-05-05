import { AppColors } from '@/constants/appColors';
import { useBookings } from '@/contexts/BookingsContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUser } from '@/contexts/UserContext';
import { useTabletLayout } from '@/hooks/use-tablet-layout';
import { getServices } from '@/lib/supabaseService';
import type { Service } from '@/lib/types';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const EXPLORE_HEADER = AppColors.primaryDark;

const translations = {
  vi: {
    explore: 'Khám Phá',
    search: 'Tìm dịch vụ...',
    allServices: 'Tất cả dịch vụ',
    massage: 'Massage',
    spa: 'Spa',
    yoga: 'Yoga',
    skincare: 'Skincare',
    loading: 'Đang tải...',
    noServices: 'Không có dịch vụ nào',
    activeBookings: 'Lịch hẹn đang chờ',
  },
  en: {
    explore: 'Explore',
    search: 'Search services...',
    allServices: 'All Services',
    massage: 'Massage',
    spa: 'Spa',
    yoga: 'Yoga',
    skincare: 'Skincare',
    loading: 'Loading...',
    noServices: 'No services found',
    activeBookings: 'Pending appointments',
  },
};

export default function ExploreScreenComponent() {
  const { language } = useLanguage();
  const strings = translations[language as keyof typeof translations] || translations.vi;
  const { bookings } = useBookings();
  const { user } = useUser();
  const tabletLayout = useTabletLayout();

  const activeBookingCount = bookings.filter(
    (b) =>
      (b.customerPhone === user?.phoneNumber || b.customerPhone === user?.email) &&
      (b.status === 'pending' || b.status === 'confirmed' || b.status === 'in-progress'),
  ).length;

  const [services, setServices] = useState<Service[]>([]);
  const [filteredServices, setFilteredServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = [
    { id: 'all', label: strings.allServices },
    { id: 'massage', label: strings.massage },
    { id: 'spa', label: strings.spa },
    { id: 'yoga', label: strings.yoga },
    { id: 'skincare', label: strings.skincare },
  ];

  useEffect(() => {
    loadServices();
  }, []);

  useEffect(() => {
    let filtered = services;

    if (selectedCategory && selectedCategory !== 'all') {
      filtered = filtered.filter((s) => s.category === selectedCategory);
    }

    if (searchText) {
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(searchText.toLowerCase()) ||
          s.description?.toLowerCase().includes(searchText.toLowerCase())
      );
    }

    setFilteredServices(filtered);
  }, [searchText, selectedCategory, services]);

  const loadServices = async () => {
    try {
      const data = await getServices();
      setServices(data);
    } catch (error) {
      console.error('Error loading services:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderServiceCard = ({ item }: { item: Service }) => (
    <TouchableOpacity style={styles.serviceCard}>
      <View style={styles.cardHeader}>
        <View style={styles.cardInfo}>
          <Text style={styles.serviceName}>{item.name}</Text>
          <Text style={styles.serviceCategory}>{item.category}</Text>
        </View>
        <View style={styles.ratingBadge}>
          <Text style={styles.ratingText}>⭐ {item.rating}</Text>
        </View>
      </View>

      <Text style={styles.serviceDescription}>{item.description}</Text>

      <View style={styles.cardFooter}>
        <View>
          <Text style={styles.duration}>⏱️ {item.duration} phút</Text>
          <Text style={styles.reviewCount}>({item.reviewCount} đánh giá)</Text>
        </View>
        <View style={styles.priceContainer}>
          <Text style={styles.price}>{item.basePrice.toLocaleString()}₫</Text>
          <Text style={styles.arrowIcon}>›</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={EXPLORE_HEADER} />
      <View style={tabletLayout.contentContainer}>

      <View style={[styles.header, { paddingHorizontal: tabletLayout.horizontalPadding }]}>
        <Text style={styles.title}>{strings.explore}</Text>

        {activeBookingCount > 0 && (
          <View style={styles.bookingBanner}>
            <Text style={styles.bookingBannerIcon}>📋</Text>
            <Text style={styles.bookingBannerText}>
              {strings.activeBookings}
            </Text>
            <View style={styles.bookingBadge}>
              <Text style={styles.bookingBadgeText}>{activeBookingCount}</Text>
            </View>
          </View>
        )}

        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder={strings.search}
            placeholderTextColor="rgba(255,255,255,0.45)"
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>
      </View>

      <FlatList
        horizontal
        data={categories}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.categoriesContainer, { paddingHorizontal: tabletLayout.horizontalPadding }]}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.categoryButton,
              (selectedCategory === item.id || (selectedCategory === null && item.id === 'all')) &&
                styles.categoryButtonActive,
            ]}
            onPress={() => setSelectedCategory(item.id === 'all' ? null : item.id)}
          >
            <Text
              style={[
                styles.categoryButtonText,
                (selectedCategory === item.id || (selectedCategory === null && item.id === 'all')) &&
                  styles.categoryButtonTextActive,
              ]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        )}
      />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={AppColors.accentMuted} />
          <Text style={styles.loadingText}>{strings.loading}</Text>
        </View>
      ) : filteredServices.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{strings.noServices}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredServices}
          keyExtractor={(item) => item.id}
          renderItem={renderServiceCard}
          contentContainerStyle={[styles.listContainer, { paddingHorizontal: tabletLayout.horizontalPadding }]}
          showsVerticalScrollIndicator={false}
        />
      )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: EXPLORE_HEADER,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  bookingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  bookingBannerIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  bookingBannerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  bookingBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  bookingBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: EXPLORE_HEADER,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    fontSize: 14,
    color: '#FFFFFF',
  },
  categoriesContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  categoryButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  categoryButtonActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  categoryButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  categoryButtonTextActive: {
    color: EXPLORE_HEADER,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 12,
  },
  serviceCard: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    marginBottom: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  cardInfo: {
    flex: 1,
  },
  serviceName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  serviceCategory: {
    fontSize: 12,
    color: AppColors.accentMuted,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  ratingBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  serviceDescription: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 12,
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  duration: {
    fontSize: 12,
    color: AppColors.accentMuted,
    fontWeight: '500',
    marginBottom: 4,
  },
  reviewCount: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
  },
  priceContainer: {
    alignItems: 'flex-end',
  },
  price: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  arrowIcon: {
    fontSize: 20,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '300',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
  },
});
