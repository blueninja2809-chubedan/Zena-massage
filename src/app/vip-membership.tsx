import { RequireCustomerSession } from '@/components/RequireCustomerSession';
import { useReviewMode } from '@/contexts/ReviewModeContext';
import VipMembershipScreen from '@/components/VipMembershipScreen';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';

export default function VipMembershipRoute() {
  const router = useRouter();
  const { hideVipSubscription } = useReviewMode();

  useEffect(() => {
    if (hideVipSubscription) {
      router.replace('/(tabs)/account');
    }
  }, [hideVipSubscription, router]);

  if (hideVipSubscription) return null;

  return (
    <RequireCustomerSession>
      <VipMembershipScreen onClose={() => router.back()} />
    </RequireCustomerSession>
  );
}
