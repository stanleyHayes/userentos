import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ConfigContext, ExpoConfig } from 'expo/config'

/**
 * app.json holds the configuration; this adds what depends on the build.
 *
 * Android push needs Firebase's google-services.json, which is not committed.
 * EAS supplies it as a file environment variable, GOOGLE_SERVICES_JSON, whose
 * value during the build is the path of the uploaded file (see DEPLOYMENT.md,
 * "Android push"). A local ./google-services.json is used only by
 * `npx expo run:android` and `npx expo prebuild`: EAS builds, --local ones
 * too, archive the project without gitignored files, so they need the
 * variable. Without either the build still succeeds, but Android push
 * registration fails (expo-notifications needs Firebase for the device token).
 */
export default ({ config, projectRoot }: ConfigContext): ExpoConfig => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON
    || (existsSync(resolve(projectRoot, 'google-services.json')) ? './google-services.json' : undefined)
  return {
    ...config,
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
  } as ExpoConfig
}
