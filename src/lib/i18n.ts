import i18n from "i18next";
import { initReactI18next } from "react-i18next";

/**
 * StadSpear localization scaffold.
 *
 * The AI concierge backend already handles multilingual model output via the
 * gateway (`language` field on /api/chat). This module localizes the STATIC
 * chrome — nav labels, dashboard headings, empty states, buttons — so no raw
 * string primitives sit in JSX. Adding a new locale = adding another key set
 * under `resources` below; no component code changes.
 *
 * Supported UI locales (mirrors the concierge `LANGS` set):
 *   en (default), es, fr, pt, ar, ja, hi, de
 */

export const SUPPORTED_UI_LOCALES = ["en", "es", "fr", "pt", "ar", "ja", "hi", "de"] as const;
export type UiLocale = (typeof SUPPORTED_UI_LOCALES)[number];

const en = {
  common: {
    dashboard: "Dashboard",
    hub: "Hub",
    backToHub: "Back to hub",
    refresh: "Refresh",
    submit: "Submit",
    submitIncident: "Submit incident",
    signOut: "Sign out",
    signIn: "Sign in",
    loading: "Loading…",
    unavailable: "Unavailable",
    degradedBanner: "Live data temporarily unavailable — showing best-effort fallback.",
  },
  dashboard: {
    title: "Live ops dashboard",
    subtitle: "Real-time AI tool latency, fallback rates, and stream duration across stadium threads.",
    allStadiums: "All stadiums",
    windowLabel: "Time window",
    toolCalls: "Tool calls",
    fallbackRate: "Fallback rate",
    avgLatency: "Avg tool latency",
    p95Stream: "p95 stream duration",
    fellBack: "{{count}} fell back",
    aboveThreshold: "Above 20% threshold",
    withinBand: "Within nominal band",
    metricsUpdatedAt: "Metrics updated at {{time}}",
    refreshingMetrics: "Refreshing metrics",
    loadingMetrics: "Loading operational metrics…",
    emptyTitle: "No telemetry in this window",
    emptyHint: "Widen the time range or send a message from the hub to generate tool events.",
  },
  hub: {
    conciergeLabel: "StadSpear concierge conversation",
    thinking: "StadSpear is thinking…",
    telemetryTitle: "Live telemetry",
    transitOptions: "Transit options",
    stadiumStatus: "Stadium status",
    placeholder: "Ask about gates, transit, accessibility, or crowds…",
  },
  a11y: {
    liveUpdates: "Live updates",
    conversationLog: "Conversation log",
  },
} as const;

// Non-English locales fall back to `en` for keys they haven't localized yet.
// Fill them in incrementally without breaking the UI in the meantime.
const es = { common: { dashboard: "Panel", hub: "Centro", backToHub: "Volver al centro", refresh: "Actualizar", submitIncident: "Reportar incidente", signOut: "Cerrar sesión", signIn: "Iniciar sesión", loading: "Cargando…" } };
const fr = { common: { dashboard: "Tableau de bord", hub: "Centre", backToHub: "Retour au centre", refresh: "Actualiser", submitIncident: "Signaler un incident", signOut: "Se déconnecter", signIn: "Se connecter", loading: "Chargement…" } };
const pt = { common: { dashboard: "Painel", hub: "Central", backToHub: "Voltar à central", refresh: "Atualizar", submitIncident: "Reportar incidente", signOut: "Sair", signIn: "Entrar", loading: "Carregando…" } };
const ar = { common: { dashboard: "لوحة القيادة", hub: "المركز", backToHub: "العودة إلى المركز", refresh: "تحديث", submitIncident: "الإبلاغ عن حادث", signOut: "تسجيل الخروج", signIn: "تسجيل الدخول", loading: "جارٍ التحميل…" } };
const ja = { common: { dashboard: "ダッシュボード", hub: "ハブ", backToHub: "ハブに戻る", refresh: "更新", submitIncident: "インシデント報告", signOut: "サインアウト", signIn: "サインイン", loading: "読み込み中…" } };
const hi = { common: { dashboard: "डैशबोर्ड", hub: "हब", backToHub: "हब पर वापस", refresh: "रीफ़्रेश", submitIncident: "घटना दर्ज करें", signOut: "साइन आउट", signIn: "साइन इन", loading: "लोड हो रहा है…" } };
const de = { common: { dashboard: "Übersicht", hub: "Zentrale", backToHub: "Zurück zur Zentrale", refresh: "Aktualisieren", submitIncident: "Vorfall melden", signOut: "Abmelden", signIn: "Anmelden", loading: "Wird geladen…" } };

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      fr: { translation: fr },
      pt: { translation: pt },
      ar: { translation: ar },
      ja: { translation: ja },
      hi: { translation: hi },
      de: { translation: de },
    },
    lng: (typeof window !== "undefined" && localStorage.getItem("stadspear:locale")) || "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export function setUiLocale(locale: UiLocale) {
  i18n.changeLanguage(locale);
  if (typeof window !== "undefined") localStorage.setItem("stadspear:locale", locale);
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }
}

export default i18n;
