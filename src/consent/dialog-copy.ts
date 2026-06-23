import type { ConsentPurposes } from "./consent-store.js";

export type SupportedConsentLocale = "en" | "de" | "es" | "fr" | "pt" | "ja";

export type ConsentDialogCopy = {
  body: string;
  accept_personalized: string;
  use_basic_ads: string;
  customize: string;
  hide_customize: string;
  save_preferences: string;
  purpose_labels: Record<keyof ConsentPurposes, string>;
};

export const CONSENT_DIALOG_COPY: Record<SupportedConsentLocale, ConsentDialogCopy> = {
  en: {
    body:
      "To show you relevant ads, this app uses wavebird. Accept personalized ads for better matches, or choose basic ads that don't use your interests.",
    accept_personalized: "Accept personalized ads",
    use_basic_ads: "Use basic ads only",
    customize: "Customize",
    hide_customize: "Hide customization",
    save_preferences: "Save preferences",
    purpose_labels: {
      store_access: "Store and access information",
      basic_ads: "Basic ads",
      personalized_ads: "Personalized ads",
      measurement: "Measurement",
    },
  },
  de: {
    body:
      "Damit diese App relevante Werbung zeigen kann, nutzt sie wavebird. Akzeptiere personalisierte Werbung für passendere Treffer oder wähle einfache Werbung ohne Nutzung deiner Interessen.",
    accept_personalized: "Personalisierte Werbung akzeptieren",
    use_basic_ads: "Nur einfache Werbung",
    customize: "Anpassen",
    hide_customize: "Anpassung ausblenden",
    save_preferences: "Auswahl speichern",
    purpose_labels: {
      store_access: "Informationen speichern und abrufen",
      basic_ads: "Einfache Werbung",
      personalized_ads: "Personalisierte Werbung",
      measurement: "Messung",
    },
  },
  es: {
    body:
      "Para mostrar anuncios relevantes, esta app usa wavebird. Acepta anuncios personalizados para obtener mejores coincidencias o elige anuncios básicos que no usen tus intereses.",
    accept_personalized: "Aceptar anuncios personalizados",
    use_basic_ads: "Usar solo anuncios básicos",
    customize: "Personalizar",
    hide_customize: "Ocultar personalización",
    save_preferences: "Guardar preferencias",
    purpose_labels: {
      store_access: "Guardar y acceder a información",
      basic_ads: "Anuncios básicos",
      personalized_ads: "Anuncios personalizados",
      measurement: "Medición",
    },
  },
  fr: {
    body:
      "Pour afficher des annonces pertinentes, cette application utilise wavebird. Acceptez les annonces personnalisées pour de meilleurs résultats ou choisissez des annonces de base sans utiliser vos centres d'intérêt.",
    accept_personalized: "Accepter les annonces personnalisées",
    use_basic_ads: "Utiliser des annonces basiques",
    customize: "Personnaliser",
    hide_customize: "Masquer la personnalisation",
    save_preferences: "Enregistrer les préférences",
    purpose_labels: {
      store_access: "Stocker et acceder aux informations",
      basic_ads: "Annonces basiques",
      personalized_ads: "Annonces personnalisees",
      measurement: "Mesure",
    },
  },
  pt: {
    body:
      "Para mostrar anuncios relevantes, este app usa o wavebird. Aceite anuncios personalizados para receber melhores combinacoes ou escolha anuncios basicos que nao usam seus interesses.",
    accept_personalized: "Aceitar anuncios personalizados",
    use_basic_ads: "Usar apenas anuncios basicos",
    customize: "Personalizar",
    hide_customize: "Ocultar personalizacao",
    save_preferences: "Salvar preferencias",
    purpose_labels: {
      store_access: "Armazenar e acessar informacoes",
      basic_ads: "Anuncios basicos",
      personalized_ads: "Anuncios personalizados",
      measurement: "Medicao",
    },
  },
  ja: {
    body:
      "このアプリは関連性の高い広告を表示するために wavebird を利用します。より適した広告のためにパーソナライズ広告を許可するか、興味関心を使わない基本広告を選択してください。",
    accept_personalized: "パーソナライズ広告を許可",
    use_basic_ads: "基本広告のみ",
    customize: "カスタマイズ",
    hide_customize: "カスタマイズを閉じる",
    save_preferences: "設定を保存",
    purpose_labels: {
      store_access: "情報の保存とアクセス",
      basic_ads: "基本広告",
      personalized_ads: "パーソナライズ広告",
      measurement: "測定",
    },
  },
};
