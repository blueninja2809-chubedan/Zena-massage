import MassageLocationScreen from '@/components/MassageLocationScreen';
import { RequireCustomerSession } from '@/components/RequireCustomerSession';
import { useRouter } from 'expo-router';
import React from 'react';

export default function MassageLocationRoute() {
  const router = useRouter();
  return (
    <RequireCustomerSession>
      <MassageLocationScreen onClose={() => router.back()} />
    </RequireCustomerSession>
  );
}
