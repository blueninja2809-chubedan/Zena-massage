import { DEFAULT_CITY, SERVICE_TYPES, VIETNAM_PROVINCES } from '@/constants/bookingFilters';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUser } from '@/contexts/UserContext';
import { getTherapists } from '@/lib/supabaseService';
import type { Therapist } from '@/lib/types';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Modal,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TherapistDetailScreen from './TherapistDetailScreen';

const TAGS = ['Mới cập nhật', 'Mới đến', 'Chất lượng'];

const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  'Chất lượng': { bg: '#E53935', text: '#fff' },
  'Mới đến': { bg: '#C62828', text: '#fff' },
  'Mới cập nhật': { bg: '#E53935', text: '#fff' },
};

const COLORS = {
  green: '#E53935',
  greenLight: '#FFCDD2',
  bg: '#FFFBFB',
  white: '#fff',
  text: '#1A1A1A',
  subText: '#666',
  border: '#E0E0E0',
  gold: '#F5A623',
  goldBg: '#FFF8E1',
};

export default function MassageHomeScreen({
  onClose,
  selectedCity: selectedCityProp,
  onChangeCity,
}: {
  onClose?: () => void;
  selectedCity?: string;
  onChangeCity?: (city: string) => void | Promise<void>;
} = {}) {
  const router = useRouter();
  const { user, setUser } = useUser();
  const { language } = useLanguage();
  const isVipMember = !!user?.isVipMember;
  const isEn = language === 'en';

  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState<'nearby' | 'popular' | null>('nearby');

  // Filter modal state
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filterGender, setFilterGender] = useState<'all' | 'male' | 'female'>('all');
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<'all' | 'available' | 'rest'>('all');

  // Applied filters
  const [appliedGender, setAppliedGender] = useState<'all' | 'male' | 'female'>('all');
  const [appliedTags, setAppliedTags] = useState<string[]>([]);
  const [appliedStatus, setAppliedStatus] = useState<'all' | 'available' | 'rest'>('all');

  // Service type modal
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [selectedService, setSelectedService] = useState('Tất cả');
  const [selectedCity, setSelectedCity] = useState(selectedCityProp || user?.selectedCity || DEFAULT_CITY);
  const [showCityModal, setShowCityModal] = useState(false);
  const [cityQuery, setCityQuery] = useState('');

  // Therapist detail
  const [selectedTherapist, setSelectedTherapist] = useState<Therapist | null>(null);

  useEffect(() => {
    const loadTherapists = async () => {
      try {
        const data = await getTherapists();
        setTherapists(data);
      } catch (error) {
        console.error('Error loading therapists:', error);
      } finally {
        setLoading(false);
      }
    };

    loadTherapists();
  }, []);

  useEffect(() => {
    if (selectedCityProp && selectedCityProp !== selectedCity) {
      setSelectedCity(selectedCityProp);
    }
  }, [selectedCityProp, selectedCity]);

  const resolveTherapistCity = (item: Therapist) => {
    if (item.workingCity?.trim()) {
      return item.workingCity.trim();
    }
    const hash = item.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return VIETNAM_PROVINCES[hash % VIETNAM_PROVINCES.length];
  };

  const filteredCities = React.useMemo(
    () => VIETNAM_PROVINCES.filter((city) => city.toLowerCase().includes(cityQuery.trim().toLowerCase())),
    [cityQuery],
  );

  const handleSelectCity = async (city: string) => {
    setSelectedCity(city);
    setShowCityModal(false);
    if (onChangeCity) {
      await onChangeCity(city);
      return;
    }
    if (user) {
      await setUser({ ...user, selectedCity: city });
    }
  };

  const filteredTherapists = React.useMemo(() => {
    let list = [...therapists];

    list = list.filter((t) => resolveTherapistCity(t) === selectedCity);

    // Gender filter
    if (appliedGender !== 'all') {
      list = list.filter((t) => t.gender === appliedGender);
    }

    // Tag filter (Chất lượng = rating >= 4.8, Mới đến = experience <= 1, Mới cập nhật = any)
    if (appliedTags.length > 0) {
      list = list.filter((t) => {
        return appliedTags.some((tag) => {
          if (tag === 'Chất lượng') return t.rating >= 4.8;
          if (tag === 'Mới đến') return t.experience <= 1;
          if (tag === 'Mới cập nhật') return true;
          return false;
        });
      });
    }

    // Status filter
    if (appliedStatus === 'available') {
      list = list.filter((t) => t.isAvailable);
    } else if (appliedStatus === 'rest') {
      list = list.filter((t) => !t.isAvailable);
    }

    // Service filter
    if (selectedService !== 'Tất cả') {
      list = list.filter((t) =>
        t.specialties.some((s) => s.toLowerCase().includes(selectedService.toLowerCase()))
      );
    }

    // Search
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      list = list.filter((t) => t.name.toLowerCase().includes(q));
    }

    // Sort
    if (sortBy === 'nearby') {
      list.sort((a, b) => a.distanceFromCenter - b.distanceFromCenter);
    } else if (sortBy === 'popular') {
      list.sort((a, b) => b.reviewCount - a.reviewCount);
    }

    if (!isVipMember) {
      return list.slice(0, 6);
    }
    return list;
  }, [therapists, selectedCity, appliedGender, appliedTags, appliedStatus, selectedService, searchText, sortBy, isVipMember]);

  const openFilterModal = () => {
    setFilterGender(appliedGender);
    setFilterTags([...appliedTags]);
    setFilterStatus(appliedStatus);
    setShowFilterModal(true);
  };

  const applyFilters = () => {
    setAppliedGender(filterGender);
    setAppliedTags([...filterTags]);
    setAppliedStatus(filterStatus);
    setShowFilterModal(false);
  };

  const resetFilters = () => {
    setFilterGender('all');
    setFilterTags([]);
    setFilterStatus('all');
  };

  const toggleTag = (tag: string) => {
    setFilterTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const getTagForTherapist = (item: Therapist): string | null => {
    if (item.rating >= 4.8) return 'Chất lượng';
    if (item.experience <= 1) return 'Mới đến';
    return null;
  };

  const hasActiveFilters =
    appliedGender !== 'all' || appliedTags.length > 0 || appliedStatus !== 'all';

  const renderTherapist = ({ item }: { item: Therapist }) => {
    const tag = getTagForTherapist(item);
    const tagColor = tag ? TAG_COLORS[tag] : null;
    const distanceText =
      item.distanceFromCenter < 1
        ? `${Math.round(item.distanceFromCenter * 1000)}m`
        : `${item.distanceFromCenter} km`;

    return (
      <View style={styles.card}>
        <TouchableOpacity style={styles.cardTouchArea} onPress={() => setSelectedTherapist(item)} activeOpacity={0.7}>
          {/* Avatar with badge */}
          <View style={styles.avatarWrap}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>
                {item.gender === 'female' ? '👩' : '👨'}
              </Text>
            </View>
            {tag && tagColor && (
              <View style={[styles.tagBadge, { backgroundColor: tagColor.bg }]}>
                <Text style={[styles.tagBadgeText, { color: tagColor.text }]}>{tag}</Text>
              </View>
            )}
          </View>

          {/* Info */}
          <View style={styles.cardInfo}>
            <View style={styles.cardRow}>
              <Text style={styles.therapistName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.earliestTime}>Sớm nhất 12:00</Text>
            </View>
            <View style={styles.ratingRow}>
              <Text style={styles.starIcon}>⭐</Text>
              <Text style={styles.ratingValue}>{item.rating.toFixed(1)}</Text>
              <Text style={styles.reviewCount}>({item.reviewCount} {isEn ? 'reviews' : 'đánh giá'})</Text>
            </View>
            {isVipMember ? (
              <Text style={styles.vipAgeText}>{isEn ? 'Age' : 'Tuổi'}: {estimateAge(item)}</Text>
            ) : null}
            <View style={styles.distanceRow}>
              <Text style={styles.distanceIcon}>📍</Text>
              <Text style={styles.distanceText}>{distanceText}</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Book button */}
        <TouchableOpacity style={styles.bookButton} onPress={() => setSelectedTherapist(item)}>
          <Text style={styles.bookButtonText}>Đặt</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />

      {/* Header */}
      <View style={styles.screenTop}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => onClose ? onClose() : router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.locationBtn} onPress={() => setShowCityModal(true)}>
          <Text style={styles.locationText}>{selectedCity}</Text>
          <Text style={styles.locationArrow}>▾</Text>
        </TouchableOpacity>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm kiếm..."
            placeholderTextColor="#999"
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>
        <TouchableOpacity style={styles.heartBtn}>
          <Text style={styles.heartIcon}>♡</Text>
        </TouchableOpacity>
      </View>

      {/* VIP Banner */}
      {!isVipMember ? (
        <View style={styles.vipBanner}>
          <Text style={styles.vipCrown}>👑</Text>
          <Text style={styles.vipText}>{isEn ? 'Enjoy exclusive benefits' : 'Tận hưởng những quyền lợi đặc biệt'}</Text>
          <TouchableOpacity style={styles.upgradeBtn}>
            <Text style={styles.upgradeBtnText}>{isEn ? 'Upgrade →' : 'Nâng cấp →'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {/* Filter icon chip */}
        <TouchableOpacity
          style={[styles.filterIconChip, hasActiveFilters && styles.filterChipActive]}
          onPress={openFilterModal}
        >
          <Text style={[styles.filterIconText, hasActiveFilters && styles.filterChipActiveText]}>⚙</Text>
        </TouchableOpacity>

        {/* Gần tôi / Đặt nhiều */}
        <TouchableOpacity
          style={[styles.filterChip, sortBy === 'nearby' && styles.filterChipActive]}
          onPress={() => setSortBy(sortBy === 'nearby' ? null : 'nearby')}
        >
          <Text style={[styles.filterChipText, sortBy === 'nearby' && styles.filterChipActiveText]}>
            Gần tôi
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, sortBy === 'popular' && styles.filterChipActive]}
          onPress={() => setSortBy(sortBy === 'popular' ? null : 'popular')}
        >
          <Text style={[styles.filterChipText, sortBy === 'popular' && styles.filterChipActiveText]}>
            Đặt nhiều
          </Text>
        </TouchableOpacity>

        {/* Service type chip */}
        <TouchableOpacity
          style={[styles.filterChip, selectedService !== 'Tất cả' && styles.filterChipActive]}
          onPress={() => setShowServiceModal(true)}
        >
          <Text style={[styles.filterChipText, selectedService !== 'Tất cả' && styles.filterChipActiveText]}>
            {selectedService === 'Tất cả' ? 'Loại dịch vụ ▾' : selectedService}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.green} />
            <Text style={styles.loadingText}>{isEn ? 'Loading...' : 'Đang tải...'}</Text>
        </View>
      ) : filteredTherapists.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyEmoji}>💆</Text>
          <Text style={styles.emptyText}>{isEn ? 'No matching therapists found' : 'Không có kỹ thuật viên nào phù hợp'}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredTherapists}
          keyExtractor={(item) => item.id}
          renderItem={renderTherapist}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal visible={showCityModal} transparent animationType="slide" onRequestClose={() => setShowCityModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowCityModal(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{isEn ? 'Select province/city' : 'Chọn tỉnh/thành phố'}</Text>
            <View style={styles.citySearchWrap}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.citySearchInput}
                placeholder={isEn ? 'Search province/city...' : 'Tìm tỉnh/thành...'}
                placeholderTextColor="#999"
                value={cityQuery}
                onChangeText={setCityQuery}
              />
            </View>
            <FlatList
              data={filteredCities}
              keyExtractor={(item) => item}
              contentContainerStyle={styles.cityListContent}
              renderItem={({ item }) => {
                const active = item === selectedCity;
                return (
                  <TouchableOpacity
                    style={[styles.cityItem, active && styles.cityItemActive]}
                    onPress={() => handleSelectCity(item)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.cityItemText, active && styles.cityItemTextActive]}>{item}</Text>
                    {active ? <Text style={styles.cityCheck}>✓</Text> : null}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.cityEmptyText}>
                  {isEn ? 'No matching province/city' : 'Không tìm thấy tỉnh/thành phù hợp'}
                </Text>
              }
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* ===== Filter Modal ===== */}
      <Modal visible={showFilterModal} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setShowFilterModal(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            {/* Handle */}
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{isEn ? 'Filters' : 'Bộ lọc'}</Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Giới tính */}
              <Text style={styles.sectionLabel}>{isEn ? 'Gender' : 'Giới tính'}</Text>
              <View style={styles.chipRow}>
                {(['all', 'female', 'male'] as const).map((g) => {
                  const label = g === 'all' ? (isEn ? 'All' : 'Tất cả') : g === 'female' ? (isEn ? 'Female' : 'Nữ') : (isEn ? 'Male' : 'Nam');
                  return (
                    <TouchableOpacity
                      key={g}
                      style={[styles.radioChip, filterGender === g && styles.radioChipActive]}
                      onPress={() => setFilterGender(g)}
                    >
                      <Text style={[styles.radioChipText, filterGender === g && styles.radioChipActiveText]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Tag */}
              <Text style={styles.sectionLabel}>{isEn ? 'Tags' : 'Tag'}</Text>
              <View style={styles.chipRow}>
                {TAGS.map((tag) => (
                  <TouchableOpacity
                    key={tag}
                    style={[styles.radioChip, filterTags.includes(tag) && styles.radioChipActive]}
                    onPress={() => toggleTag(tag)}
                  >
                    <Text style={[styles.radioChipText, filterTags.includes(tag) && styles.radioChipActiveText]}>
                      {tag}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Trạng thái */}
              <Text style={styles.sectionLabel}>{isEn ? 'Status' : 'Trạng thái'}</Text>
              <View style={styles.chipRow}>
                {(['all', 'available', 'rest'] as const).map((s) => {
                  const label = s === 'all' ? (isEn ? 'All' : 'Tất cả') : s === 'available' ? (isEn ? 'Available' : 'Sẵn sàng') : (isEn ? 'Resting' : 'Nghỉ ngơi');
                  return (
                    <TouchableOpacity
                      key={s}
                      style={[styles.radioChip, filterStatus === s && styles.radioChipActive]}
                      onPress={() => setFilterStatus(s)}
                    >
                      <Text style={[styles.radioChipText, filterStatus === s && styles.radioChipActiveText]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {isVipMember ? (
                <>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionLabel}>{isEn ? 'Age' : 'Độ tuổi'}</Text>
                    <View style={styles.vipTag}>
                      <Text style={styles.vipTagText}>VIP</Text>
                    </View>
                  </View>
                  <Text style={styles.vipHint}>
                    {isEn ? 'Therapist age is unlocked for VIP accounts.' : 'Tuổi kỹ thuật viên được mở khóa cho tài khoản VIP.'}
                  </Text>
                  <View style={{ height: 20 }} />
                </>
              ) : null}
            </ScrollView>

            {/* Bottom buttons */}
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.resetBtn} onPress={resetFilters}>
                <Text style={styles.resetBtnText}>{isEn ? 'Reset' : 'Đặt lại'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyBtn} onPress={applyFilters}>
                <Text style={styles.applyBtnText}>{isEn ? 'Apply' : 'Áp dụng'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ===== Service Type Modal ===== */}
      <Modal visible={showServiceModal} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setShowServiceModal(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{isEn ? 'Service type' : 'Loại dịch vụ'}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {SERVICE_TYPES.map((svc) => (
                <TouchableOpacity
                  key={svc}
                  style={styles.serviceRow}
                  onPress={() => {
                    setSelectedService(svc);
                    setShowServiceModal(false);
                  }}
                >
                  <Text style={[
                    styles.serviceRowText,
                    selectedService === svc && styles.serviceRowTextActive,
                  ]}>
                    {svc}
                  </Text>
                  {selectedService === svc && (
                    <View style={styles.serviceCheck}>
                      <Text style={styles.serviceCheckIcon}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
              <View style={{ height: 30 }} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ===== Therapist Detail Modal ===== */}
      <Modal visible={selectedTherapist !== null} animationType="slide">
        {selectedTherapist && (
          <TherapistDetailScreen
            therapist={selectedTherapist}
            onClose={() => setSelectedTherapist(null)}
          />
        )}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  screenTop: {
    paddingTop: 6,
    paddingBottom: 10,
    backgroundColor: COLORS.white,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 18,
    color: COLORS.text,
  },
  locationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  locationText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  locationArrow: {
    fontSize: 12,
    color: COLORS.subText,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  searchIcon: {
    fontSize: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
    padding: 0,
  },
  heartBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartIcon: {
    fontSize: 20,
    color: COLORS.text,
  },

  // VIP Banner
  vipBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.goldBg,
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  vipCrown: {
    fontSize: 18,
  },
  vipText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#7A5400',
  },
  upgradeBtn: {
    backgroundColor: COLORS.gold,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  upgradeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },

  // Filter chips
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: COLORS.white,
  },
  filterIconChip: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  filterIconText: {
    fontSize: 16,
    color: COLORS.subText,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  filterChipActive: {
    backgroundColor: COLORS.green,
    borderColor: COLORS.green,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.text,
  },
  filterChipActiveText: {
    color: '#fff',
    fontWeight: '600',
  },

  // List
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 30,
  },

  // Therapist Card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    gap: 12,
  },
  cardTouchArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#EEE',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarText: {
    fontSize: 32,
  },
  tagBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    paddingVertical: 2,
    alignItems: 'center',
  },
  tagBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  cardInfo: {
    flex: 1,
    gap: 3,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  therapistName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  earliestTime: {
    fontSize: 11,
    color: COLORS.subText,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  starIcon: {
    fontSize: 12,
  },
  ratingValue: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  reviewCount: {
    fontSize: 12,
    color: COLORS.subText,
  },
  vipAgeText: {
    fontSize: 12,
    color: '#7A5400',
    fontWeight: '600',
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  distanceIcon: {
    fontSize: 12,
  },
  distanceText: {
    fontSize: 12,
    color: COLORS.subText,
  },
  bookButton: {
    backgroundColor: COLORS.green,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  bookButtonText: {
    color: '#fff',
    fontSize: 14,
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

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    maxHeight: '85%',
  },
  citySearchWrap: {
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    borderRadius: 14,
    paddingHorizontal: 10,
    gap: 6,
  },
  citySearchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    paddingVertical: 10,
  },
  cityListContent: {
    paddingBottom: 18,
  },
  cityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E7E7E7',
    backgroundColor: '#FAFAFA',
    marginBottom: 8,
  },
  cityItemActive: {
    backgroundColor: COLORS.green,
    borderColor: COLORS.green,
  },
  cityItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  cityItemTextActive: {
    color: '#fff',
  },
  cityCheck: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  cityEmptyText: {
    textAlign: 'center',
    paddingVertical: 18,
    fontSize: 14,
    color: COLORS.subText,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DDD',
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 18,
  },

  // Filter modal sections
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 20,
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.subText,
    marginBottom: 10,
    marginTop: 20,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  radioChip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1.2,
    borderColor: '#DDD',
    backgroundColor: COLORS.white,
  },
  radioChipActive: {
    backgroundColor: COLORS.green,
    borderColor: COLORS.green,
  },
  radioChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.text,
  },
  radioChipActiveText: {
    color: '#fff',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  checkLabel: {
    fontSize: 14,
    color: COLORS.text,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#CCC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS.green,
    borderColor: COLORS.green,
  },
  checkmark: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  vipTag: {
    backgroundColor: COLORS.gold,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 4,
  },
  vipTagText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  vipHint: {
    fontSize: 12,
    color: COLORS.subText,
    lineHeight: 18,
  },
  vipLink: {
    fontSize: 13,
    color: COLORS.green,
    fontWeight: '600',
    marginTop: 4,
  },

  // Modal footer
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  resetBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  resetBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  applyBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.green,
    alignItems: 'center',
  },
  applyBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },

  // Service type modal
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  serviceRowText: {
    fontSize: 15,
    color: COLORS.text,
  },
  serviceRowTextActive: {
    color: COLORS.green,
    fontWeight: '600',
  },
  serviceCheck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceCheckIcon: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});

function estimateAge(item: Therapist) {
  const base = 21 + item.experience;
  const hash = item.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return base + (hash % 5);
}
