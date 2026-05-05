import { RequireCustomerSession } from '@/components/RequireCustomerSession';
import ServiceBookingScreen from '@/components/ServiceBookingScreen';
import React from 'react';

export default function ServiceBookingRoute() {
  return (
    <RequireCustomerSession>
      <ServiceBookingScreen />
    </RequireCustomerSession>
  );
}
