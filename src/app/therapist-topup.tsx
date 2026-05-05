import { RequireCustomerSession } from '@/components/RequireCustomerSession';
import TherapistTopUpScreen from '@/components/TherapistTopUpScreen';
import { useRouter } from 'expo-router';
import React from 'react';

export default function TherapistTopUpRoute() {
  const router = useRouter();
  return (
    <RequireCustomerSession>
      <TherapistTopUpScreen onClose={() => router.back()} />
    </RequireCustomerSession>
  );
}
