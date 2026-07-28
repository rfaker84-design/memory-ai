/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MOBILE_API_BASE_URL?: string;
  readonly VITE_MOBILE_TEST_VIDEO_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __MOBILE_DEBUG_BUILD__: boolean;
