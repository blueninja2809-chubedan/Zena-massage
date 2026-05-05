import { RequireCustomerSession } from '@/components/RequireCustomerSession';
import TherapistScheduleScreen from '@/components/TherapistScheduleScreen';
import React from 'react';

export default function TherapistScheduleTab() {
  return (
    <RequireCustomerSession>
      <TherapistScheduleScreen />
    </RequireCustomerSession>
  );
}
