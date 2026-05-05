import { RequireCustomerSession } from '@/components/RequireCustomerSession';
import TherapistOrderHistoryScreen from '@/components/TherapistOrderHistoryScreen';
import { useRouter } from 'expo-router';
import React from 'react';

export default function TherapistOrderHistoryRoute() {
  const router = useRouter();
  return (
    <RequireCustomerSession>
      <TherapistOrderHistoryScreen onClose={() => router.back()} />
    </RequireCustomerSession>
  );
}
