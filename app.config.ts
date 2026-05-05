import type { ExpoConfig } from 'expo/config';

// Keep `app.json` as the single source of truth; inject native-only values via env (not committed).
const appJson = require('./app.json') as { expo: ExpoConfig };

export default (): ExpoConfig => {
  const base: ExpoConfig = appJson.expo;

  const basePlugins = (base.plugins ?? []) as NonNullable<ExpoConfig['plugins']>;

  /** Secret downloads token (sk.) — Mapbox → Downloads:Read; EAS/local env, không commit. */
  const mapboxDownloadsToken = (
    process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN ||
    process.env.MAPBOX_DOWNLOADS_TOKEN ||
    ''
  ).trim();
  const mapboxPlugin: NonNullable<ExpoConfig['plugins']> = mapboxDownloadsToken
    ? [['@rnmapbox/maps', { RNMapboxMapsDownloadToken: mapboxDownloadsToken }]]
    : ['@rnmapbox/maps'];

  return {
    ...base,
    plugins: [...basePlugins, ...mapboxPlugin],
  };
};
