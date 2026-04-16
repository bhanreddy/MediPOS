import { ExpoConfig, ConfigContext } from 'expo/config'

const APP_ENV = process.env.APP_ENV || 'development'

const envConfig = {
  development: {
    name: 'MedPOS (Dev)',
    bundleId: 'com.yourcompany.medicalpos.dev',
    icon: './assets/icon-dev.png',
  },
  staging: {
    name: 'MedPOS (Staging)',
    bundleId: 'com.yourcompany.medicalpos.staging',
    icon: './assets/icon-staging.png',
  },
  production: {
    name: 'MedPOS',
    bundleId: 'com.yourcompany.medicalpos',
    icon: './assets/icon.png',
  },
} as const;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: envConfig[APP_ENV as keyof typeof envConfig].name,
  slug: 'medical-pos',
  scheme: 'medpos',
  version: '1.0.0',
  icon: envConfig[APP_ENV as keyof typeof envConfig].icon,
  android: {
    package: envConfig[APP_ENV as keyof typeof envConfig].bundleId,
    googleServicesFile: './google-services.json',
    versionCode: 1,
    permissions: [
      "CAMERA",
      "READ_EXTERNAL_STORAGE",
      "WRITE_EXTERNAL_STORAGE",
      "NOTIFICATIONS",
      "VIBRATE"
    ]
  },
  ios: {
    bundleIdentifier: envConfig[APP_ENV as keyof typeof envConfig].bundleId,
    infoPlist: {
      NSCameraUsageDescription: "Required to scan purchase bills",
      NSPhotoLibraryUsageDescription: "Required to upload purchase bills"
    }
  },
  notification: {
    icon: "./assets/notification-icon.png",
    color: "#00C9A7",
    androidMode: "default",
    androidCollapsedTitle: "Medical POS Alert"
  },
  plugins: [
    "expo-router",
    "expo-notifications",
    [
      "expo-camera",
      { "cameraPermission": "Required to scan purchase bills and medicine barcodes" }
    ],
    "expo-barcode-scanner"
  ],
  extra: {
    APP_ENV,
    eas: {
      projectId: process.env.EXPO_PROJECT_ID,
    },
  },
})
