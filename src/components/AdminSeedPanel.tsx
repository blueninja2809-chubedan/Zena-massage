import { useLanguage } from '@/contexts/LanguageContext';
import { seedDatabase } from '@/lib/seedDatabase';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

export default function AdminSeedPanel() {
  const [isVisible, setIsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');
  const { language } = useLanguage();

  const handleSeedData = async () => {
    try {
      setIsLoading(true);
      setStatus('Đang import data...');
      await seedDatabase();
      setStatus('✅ Thành công! Data đã thêm vào database');
    } catch (error: any) {
      setStatus(`❌ Lỗi: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setStatus('');
    setIsVisible(false);
  };

  return (
    <>
      {/* Button to open seed panel */}
      <TouchableOpacity
        style={styles.seedButton}
        onPress={() => setIsVisible(true)}
      >
        <Text style={styles.seedButtonText}>⚡ Seed Data</Text>
      </TouchableOpacity>

      {/* Modal */}
      <Modal visible={isVisible} transparent animationType="slide">
        <View style={styles.container}>
          <View style={styles.modalContent}>
            <Text style={styles.title}>
              {language === 'vi' ? '🚀 Import Sample Data' : '🚀 Import Sample Data'}
            </Text>

            <Text style={styles.description}>
              {language === 'vi'
                ? 'Nhấn nút dưới để tự động thêm services, therapists, promotions vào database'
                : 'Click the button below to automatically add services, therapists, and promotions to database'}
            </Text>

            {/* Seed Button */}
            <TouchableOpacity
              style={[styles.actionButton, styles.seedBtn]}
              onPress={handleSeedData}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionButtonText}>
                  {language === 'vi' ? '📥 Import Data Ngay' : '📥 Import Data Now'}
                </Text>
              )}
            </TouchableOpacity>

            {/* Status */}
            {status && (
              <ScrollView style={styles.statusBox}>
                <Text style={styles.statusText}>{status}</Text>
              </ScrollView>
            )}

            {/* Close Button */}
            <TouchableOpacity
              style={[styles.actionButton, styles.closeBtn]}
              onPress={handleClear}
              disabled={isLoading}
            >
              <Text style={styles.actionButtonText}>
                {language === 'vi' ? 'Đóng' : 'Close'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    minHeight: 300,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    color: '#111827',
  },
  description: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 20,
    lineHeight: 20,
  },
  actionButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  seedBtn: {
    backgroundColor: '#10B981',
  },
  closeBtn: {
    backgroundColor: '#9CA3AF',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  statusBox: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    maxHeight: 150,
  },
  statusText: {
    fontSize: 13,
    color: '#374151',
    fontFamily: 'monospace',
  },
  seedButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 12,
  },
  seedButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
