import ExploreScreen from '@/components/ExploreScreen';
import { RequireCustomerSession } from '@/components/RequireCustomerSession';
import React from 'react';

export default function ExploreNewRoute() {
  return (
    <RequireCustomerSession>
      <ExploreScreen />
    </RequireCustomerSession>
  );
}
