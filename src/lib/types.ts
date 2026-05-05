/**
 * Data Models and Types for Zena Massage Booking App
 */

// SERVICE MODELS
export interface Service {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  category: 'massage' | 'spa' | 'yoga' | 'haircare' | 'skincare';
  icon: string;
  basePrice: number;
  duration: number; // in minutes
  image: string;
  rating: number;
  reviewCount: number;
  isActive: boolean;
  createdAt: string;
}

// THERAPIST MODELS
export interface Therapist {
  id: string;
  name: string;
  phoneNumber: string;
  email: string;
  gender: 'male' | 'female';
  avatar: string;
  photos?: string[];
  bio: string;
  bioEn: string;
  specialties: string[]; // service categories they specialize in
  experience: number; // years
  rating: number;
  reviewCount: number;
  hourlyRate: number;
  distanceFromCenter: number; // in km
  currentLatitude?: number;
  currentLongitude?: number;
  locationUpdatedAt?: string;
  workingCity?: string;
  isAvailable: boolean;
  availability: Record<string, string[]>; // day -> [time slots]
  languages: string[];
  certifications: string[];
  createdAt: string;
}

// BOOKING MODELS
export interface Booking {
  id: string;
  userId: string;
  serviceId: string;
  therapistId: string;
  clientName: string;
  clientPhone: string;
  address: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  bookingDate: string; // YYYY-MM-DD
  bookingTime: string; // HH:mm format
  duration: number; // in minutes
  totalPrice: number;
  status: 'pending' | 'confirmed' | 'in-progress' | 'completed' | 'cancelled';
  notes: string;
  cancellationReason?: string;
  createdAt: string;
  completedAt?: string;
  specialRequests: string[];
}

// REVIEW/RATING MODELS
export interface Review {
  id: string;
  bookingId: string;
  userId: string;
  therapistId: string;
  serviceId: string;
  rating: number; // 1-5
  comment: string;
  reviewDate: string;
  createdAt: string;
}

// ADDRESS/LOCATION MODELS
export interface SavedAddress {
  id: string;
  userId: string;
  label: string; // 'Home', 'Office', 'Other'
  address: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  isDefault: boolean;
  createdAt: string;
}

// PROMOTION MODELS
export interface Promotion {
  id: string;
  code: string;
  description: string;
  discountPercent: number;
  maxDiscountAmount: number;
  minOrderAmount: number;
  expiryDate: string;
  maxUses: number;
  currentUses: number;
  conditions: string[];
  isActive: boolean;
  createdAt: string;
}

// PAYMENT MODELS
export interface Payment {
  id: string;
  bookingId: string;
  userId: string;
  amount: number;
  method: 'cash' | 'credit_card' | 'debit_card' | 'wallet';
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  transactionId?: string;
  createdAt: string;
  completedAt?: string;
}

// FAVORITES/SAVED ITEMS
export interface FavoriteTherapist {
  userId: string;
  therapistId: string;
  addedAt: string;
}

export interface FavoriteService {
  userId: string;
  serviceId: string;
  addedAt: string;
}

// SUPPORT/CHAT MODELS
export interface SupportMessage {
  id: string;
  userId: string;
  message: string;
  type: 'user' | 'support';
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  titleEn: string;
  message: string;
  messageEn: string;
  type: 'booking' | 'promotion' | 'reminder' | 'review' | 'support' | 'job';
  relatedId?: string; // booking ID, promo code, etc.
  isRead: boolean;
  createdAt: string;
}
