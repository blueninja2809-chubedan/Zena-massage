import { Alert, type AlertButton } from 'react-native';

export type AppAlertPayload = {
  title: string;
  message?: string;
  buttons?: AlertButton[];
  options?: { cancelable?: boolean };
};

type AlertListener = (payload: AppAlertPayload) => void;

const listeners = new Set<AlertListener>();
let isInstalled = false;

function emitAlert(payload: AppAlertPayload): boolean {
  if (listeners.size === 0) return false;
  for (const listener of listeners) {
    listener(payload);
  }
  return true;
}

export function subscribeAppAlert(listener: AlertListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function installAppAlertOverride(): void {
  if (isInstalled) return;
  isInstalled = true;

  const originalAlert = Alert.alert.bind(Alert);

  Alert.alert = (
    title: string,
    message?: string,
    buttons?: AlertButton[],
    options?: { cancelable?: boolean },
  ): void => {
    const handled = emitAlert({
      title,
      message,
      buttons,
      options,
    });
    if (!handled) {
      originalAlert(title, message, buttons, options);
    }
  };
}
