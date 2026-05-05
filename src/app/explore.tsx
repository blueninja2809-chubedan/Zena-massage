import ExploreScreenComponent from '@/components/ExploreScreen';
import { RequireCustomerSession } from '@/components/RequireCustomerSession';
import React from 'react';

export default function ExploreRoute() {
  return (
    <RequireCustomerSession>
      <ExploreScreenComponent />
    </RequireCustomerSession>
  );
}
