import { RequireCustomerSession } from '@/components/RequireCustomerSession';
import TherapistEarningsScreen from '@/components/TherapistEarningsScreen';
import React from 'react';

export default function TherapistEarningsRoute() {
  return (
    <RequireCustomerSession>
      <TherapistEarningsScreen />
    </RequireCustomerSession>
  );
}
