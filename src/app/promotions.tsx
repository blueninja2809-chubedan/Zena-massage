import PromotionsScreen from '@/components/PromotionsScreen';
import { RequireCustomerSession } from '@/components/RequireCustomerSession';
import { useRouter } from 'expo-router';
import React from 'react';

export default function PromotionsRoute() {
  const router = useRouter();
  return (
    <RequireCustomerSession>
      <PromotionsScreen onClose={() => router.back()} />
    </RequireCustomerSession>
  );
}
