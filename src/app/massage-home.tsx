import MassageHomeScreen from '@/components/MassageHomeScreen';
import { RequireCustomerSession } from '@/components/RequireCustomerSession';
import { useRouter } from 'expo-router';
import React from 'react';

export default function MassageHomeRoute() {
  const router = useRouter();
  return (
    <RequireCustomerSession>
      <MassageHomeScreen onClose={() => router.back()} />
    </RequireCustomerSession>
  );
}
