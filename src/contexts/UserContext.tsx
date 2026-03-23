import {
    getUserProfileByUid,
    signOutUserAccount,
    upsertUserProfile,
} from '@/lib/supabaseService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';

const AUTH_UID_KEY = 'custom_auth_uid';

export type UserRole = 'customer' | 'therapist';

export interface UserData {
  authUid?: string;
  email?: string;
  phoneNumber?: string;
  createdAt: string;
  displayName?: string;
  gender?: 'male' | 'female' | 'other';
  nationality?: string;
  password?: string;
  avatarUri?: string;
  role?: UserRole;
  workingCity?: string;
  serviceImages?: string[];
  services?: string[];
  isVipMember?: boolean;
  vipPlanId?: 'vip_1m' | 'vip_6m' | 'vip_12m';
  vipExpiresAt?: string;
  partnerApplicationId?: string;
  partnerApplicationStatus?: 'none' | 'pending' | 'approved' | 'rejected';
  partnerRoleApprovedAt?: string;
  partnerRoleNoticeSeenAt?: string;
  selectedCity?: string;
}

interface UserContextType {
  user: UserData | null;
  setUser: (user: UserData | null) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isLoading: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

function toUserData(input: Record<string, unknown>): UserData | null {
  if (typeof input.createdAt !== 'string') {
    return null;
  }
  const hasId = (typeof input.email === 'string' && input.email.trim()) || (typeof input.phoneNumber === 'string' && input.phoneNumber.trim());
  if (!hasId) {
    return null;
  }
  return input as unknown as UserData;
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Hydrate user from AsyncStorage on app start.
  useEffect(() => {
    const hydrateFromStorage = async () => {
      try {
        const uid = await AsyncStorage.getItem(AUTH_UID_KEY);
        if (!uid) {
          setUserState(null);
          setIsLoading(false);
          return;
        }

        // First: try to load cached profile for instant startup
        const cachedJson = await AsyncStorage.getItem('cached_user_profile');
        if (cachedJson) {
          try {
            const cached = JSON.parse(cachedJson);
            const cachedUser = toUserData(cached);
            if (cachedUser) {
              setUserState(cachedUser);
              setIsLoading(false);
            }
          } catch {
            // ignore parse errors
          }
        }

        // Then: sync with remote in background
        try {
          const remoteUser = await getUserProfileByUid(uid);
          if (remoteUser) {
            const userData = toUserData(remoteUser);
            setUserState(userData);
            // Cache for next startup
            await AsyncStorage.setItem('cached_user_profile', JSON.stringify(remoteUser)).catch(() => {});
          } else {
            setUserState(null);
            await AsyncStorage.removeItem(AUTH_UID_KEY);
            await AsyncStorage.removeItem('cached_user_profile').catch(() => {});
          }
        } catch (err) {
          console.warn('[UserContext] Remote sync failed (using cache):', err);
          // Keep cached user if remote fails
        }
      } catch (error) {
        console.error('Error loading user:', error);
      } finally {
        setIsLoading(false);
      }
    };

    hydrateFromStorage();
  }, []);

  // Save profile in Supabase and persist UID locally.
  const setUser = async (newUser: UserData | null) => {
    try {
      if (newUser) {
        // Cache profile locally for fast startup next time
        await AsyncStorage.setItem('cached_user_profile', JSON.stringify(newUser)).catch(() => {});
        try {
          await upsertUserProfile(newUser as unknown as Record<string, unknown>);
        } catch (upsertErr: unknown) {
          const e = upsertErr as { message?: string; code?: string };
          console.warn('[setUser] upsertUserProfile failed (non-fatal):', e?.message, e?.code);
        }
        if (newUser.authUid) {
          await AsyncStorage.setItem(AUTH_UID_KEY, newUser.authUid);
        }
      } else {
        await AsyncStorage.removeItem(AUTH_UID_KEY);
        await AsyncStorage.removeItem('cached_user_profile').catch(() => {});
      }
      setUserState(newUser);
    } catch (error: unknown) {
      const e = error as { message?: string; code?: string; details?: string };
      console.error('Error saving user:', e?.message, e?.code, e?.details);
      throw error;
    }
  };

  // Re-fetch profile from Supabase (syncs role changes made from dashboard)
  const refreshUser = async () => {
    const uid = user?.authUid || (await AsyncStorage.getItem(AUTH_UID_KEY));
    if (!uid) return;
    const remoteUser = await getUserProfileByUid(uid);
    if (remoteUser) {
      setUserState(toUserData(remoteUser));
    }
  };

  // Logout user
  const logout = async () => {
    await signOutUserAccount();
    await AsyncStorage.removeItem(AUTH_UID_KEY);
    await AsyncStorage.removeItem('cached_user_profile').catch(() => {});
    setUserState(null);
  };

  return (
    <UserContext.Provider value={{ user, setUser, logout, refreshUser, isLoading }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within UserProvider');
  }
  return context;
}
