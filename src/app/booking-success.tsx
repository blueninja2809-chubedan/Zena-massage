import BookingSuccessScreen from '@/components/BookingSuccessScreen';
import { RequireCustomerSession } from '@/components/RequireCustomerSession';
import React from 'react';

export default function BookingSuccessRoute() {
  return (
    <RequireCustomerSession>
      <BookingSuccessScreen />
    </RequireCustomerSession>
  );
}
