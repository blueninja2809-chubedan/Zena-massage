import ActivityScreen from '@/components/ActivityScreen';
import { RequireCustomerSession } from '@/components/RequireCustomerSession';
import React from 'react';

export default function ActivityTab() {
  return (
    <RequireCustomerSession>
      <ActivityScreen />
    </RequireCustomerSession>
  );
}
