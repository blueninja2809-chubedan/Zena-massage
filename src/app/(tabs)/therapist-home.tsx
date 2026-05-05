import TherapistDashboard from '@/components/TherapistDashboard';
import { RequireCustomerSession } from '@/components/RequireCustomerSession';
import React from 'react';

export default function TherapistHomeTab() {
  return (
    <RequireCustomerSession>
      <TherapistDashboard />
    </RequireCustomerSession>
  );
}
