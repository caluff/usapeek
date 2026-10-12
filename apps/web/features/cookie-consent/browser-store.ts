"use client"

import {
  COOKIE_CONSENT_STORAGE_KEY,
  type CookiePreferences,
} from "./preferences"

const CHANGE_EVENT = "usapeek:cookie-consent-change"
let sessionPreference: string | null = null
let hasSessionPreference = false

export function subscribeToCookiePreferences(onChange: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key !== COOKIE_CONSENT_STORAGE_KEY && event.key !== null) return
    hasSessionPreference = false
    onChange()
  }
  window.addEventListener("storage", onStorage)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener("storage", onStorage)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

export function getCookiePreferencesSnapshot() {
  if (hasSessionPreference) return sessionPreference
  try {
    return window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)
  } catch {
    return sessionPreference
  }
}

export function getCookiePreferencesServerSnapshot(): undefined {
  return undefined
}

export function saveCookiePreferences(preferences: CookiePreferences) {
  sessionPreference = JSON.stringify(preferences)
  hasSessionPreference = true
  let isPersisted = false
  try {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, sessionPreference)
    isPersisted = true
  } catch {
    // Blocked storage must still allow rejection for the current visit.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
  return isPersisted
}
