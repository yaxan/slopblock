import { DEFAULT_SETTINGS, STORAGE_KEY, normalizeSettings } from "./settings";
import type { SlopBlockSettings } from "./types";

export async function loadSettings(): Promise<SlopBlockSettings> {
  const area = getLocalStorageArea();
  if (!area) {
    return DEFAULT_SETTINGS;
  }

  return new Promise((resolve) => {
    area.get(STORAGE_KEY, (data) => {
      if (chrome.runtime.lastError) {
        resolve(DEFAULT_SETTINGS);
        return;
      }

      resolve(normalizeSettings(data[STORAGE_KEY]));
    });
  });
}

export async function saveSettings(settings: SlopBlockSettings): Promise<void> {
  const area = getLocalStorageArea();
  if (!area) {
    return;
  }

  const normalized = normalizeSettings(settings);

  return new Promise((resolve, reject) => {
    area.set({ [STORAGE_KEY]: normalized }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve();
    });
  });
}

export async function resetSettings(): Promise<SlopBlockSettings> {
  await saveSettings(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

function getLocalStorageArea(): chrome.storage.StorageArea | undefined {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    return undefined;
  }

  return chrome.storage.local;
}
