import React, { createContext, useCallback, useContext, useState } from 'react';

export interface ConnectedTherapistInfo {
  id: string;
  name: string;
  avatar: string;
  rating: number;
  reviewCount: number;
  distance: number;
}

export interface ActiveBookingData {
  bookingId?: string;
  therapist: ConnectedTherapistInfo;
  services: { name: string; duration: number; price: number }[];
  totalPrice: number;
  paymentMethod: string;
  connectedAt: Date;
}

interface ActiveBookingContextType {
  activeBooking: ActiveBookingData | null;
  setActiveBooking: (booking: ActiveBookingData | null) => void;
  clearActiveBooking: () => void;
}

const ActiveBookingContext = createContext<ActiveBookingContextType | undefined>(undefined);

export function ActiveBookingProvider({ children }: { children: React.ReactNode }) {
  const [activeBooking, setActiveBookingState] = useState<ActiveBookingData | null>(null);

  const setActiveBooking = useCallback((booking: ActiveBookingData | null) => {
    setActiveBookingState(booking);
  }, []);

  const clearActiveBooking = useCallback(() => {
    setActiveBookingState(null);
  }, []);

  return (
    <ActiveBookingContext.Provider value={{ activeBooking, setActiveBooking, clearActiveBooking }}>
      {children}
    </ActiveBookingContext.Provider>
  );
}

export function useActiveBooking() {
  const context = useContext(ActiveBookingContext);
  if (context === undefined) {
    throw new Error('useActiveBooking must be used within ActiveBookingProvider');
  }
  return context;
}
