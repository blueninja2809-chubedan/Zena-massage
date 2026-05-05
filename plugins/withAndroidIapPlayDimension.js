/**
 * OpenIAP / Billing artifacts may expose a product flavor dimension "platform".
 * Ensures Gradle picks the Play Store variant ("play").
 * @see https://github.com/hyochan/react-native-iap/issues/2889
 */
const { withAppBuildGradle } = require('@expo/config-plugins');

module.exports = function withAndroidIapPlayDimension(config) {
  return withAppBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;
    if (contents.includes("missingDimensionStrategy \"platform\"") || contents.includes("missingDimensionStrategy 'platform'")) {
      mod.modResults.contents = contents;
      return mod;
    }
    const anchor = /defaultConfig\s*\{/;
    if (!anchor.test(contents)) {
      return mod;
    }
    contents = contents.replace(
      anchor,
      (m) =>
        `${m}
        missingDimensionStrategy "platform", "play"
`,
    );
    mod.modResults.contents = contents;
    return mod;
  });
};
