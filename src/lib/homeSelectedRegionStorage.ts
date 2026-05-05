import AsyncStorage from '@react-native-async-storage/async-storage';

const SELECTED_CITY_KEY = 'app_home_selected_city_v1';
const REOPEN_MASSAGE_AFTER_REGION_KEY = 'reopen_massage_after_region_v1';

export async function persistHomeSelectedCity(city: string): Promise<void> {
  const v = city.trim();
  if (!v) {
    return;
  }
  try {
    await AsyncStorage.setItem(SELECTED_CITY_KEY, v);
  } catch {
    // best-effort
  }
}

export async function loadPersistedHomeSelectedCity(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(SELECTED_CITY_KEY);
    const v = raw?.trim();
    return v || null;
  } catch {
    return null;
  }
}

export async function setReopenMassageAfterRegion(): Promise<void> {
  try {
    await AsyncStorage.setItem(REOPEN_MASSAGE_AFTER_REGION_KEY, '1');
  } catch {
    // ignore
  }
}

export async function consumeReopenMassageAfterRegion(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(REOPEN_MASSAGE_AFTER_REGION_KEY);
    if (v === '1') {
      await AsyncStorage.removeItem(REOPEN_MASSAGE_AFTER_REGION_KEY);
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}
