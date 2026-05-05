import { supabase } from './supabase';

type SeedResult = { success: boolean; message: string };

export const seedDatabase = async (): Promise<SeedResult> => {
  try {
    console.log('Starting to seed Supabase database...');

    const services = [
      {
        name: 'Massage Thu Gian',
        name_en: 'Relaxation Massage',
        base_price: 300000,
        duration: 60,
        category: 'massage',
        description: 'Xoa diu cang thang, tai tao nang luong',
        description_en: 'Relax and restore your energy',
        rating: 4.8,
        review_count: 120,
        is_active: true,
      },
      {
        name: 'Spa Thu Gian',
        name_en: 'Relaxation Spa',
        base_price: 450000,
        duration: 90,
        category: 'spa',
        description: 'Tri lieu toan than voi tinh dau tu nhien',
        description_en: 'Full body treatment with natural essential oils',
        rating: 4.9,
        review_count: 85,
        is_active: true,
      },
      {
        name: 'Yoga Sang Tao',
        name_en: 'Creative Yoga',
        base_price: 250000,
        duration: 75,
        category: 'yoga',
        description: 'Lop yoga giup co the linh hoat, tam tri tinh tam',
        description_en: 'Yoga class for flexible body and calm mind',
        rating: 4.7,
        review_count: 60,
        is_active: true,
      },
    ];

    const therapists = [
      {
        name: 'Nguyen Thi Huong',
        email: 'huong@gmail.com',
        phone_number: '0912345678',
        gender: 'female',
        experience: 5,
        specialties: ['massage', 'spa'],
        hourly_rate: 250000,
        rating: 4.8,
        review_count: 150,
        is_available: true,
        languages: ['Vietnamese', 'English'],
      },
      {
        name: 'Tran Van An',
        email: 'an@gmail.com',
        phone_number: '0987654321',
        gender: 'male',
        experience: 3,
        specialties: ['yoga', 'massage'],
        hourly_rate: 200000,
        rating: 4.6,
        review_count: 90,
        is_available: true,
        languages: ['Vietnamese'],
      },
    ];

    await supabase.from('services').insert(services);
    await supabase.from('therapists').insert(therapists);

    console.log('Supabase seed completed.');
    return { success: true, message: 'All data imported successfully' };
  } catch (error) {
    console.error('Error seeding Supabase:', error);
    throw error;
  }
};

