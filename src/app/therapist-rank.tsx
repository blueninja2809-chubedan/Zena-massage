import { RequireCustomerSession } from '@/components/RequireCustomerSession';
import TherapistRankScreen from '@/components/TherapistRankScreen';
import { useRouter } from 'expo-router';
import React from 'react';

export default function TherapistRankRoute() {
  const router = useRouter();
  return (
    <RequireCustomerSession>
      <TherapistRankScreen onClose={() => router.back()} />
    </RequireCustomerSession>
  );
}
