/**
 * Increase Gradle JVM heap on EAS (native/Nitro/IAP builds can OOM the default daemon).
 */
const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('@expo/config-plugins');

const JVM =
  '-Xmx6144m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8';

function ensureGradleProp(text, key, value) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const line = `${key}=${value}`;
  if (new RegExp(`^${escapedKey}=`, 'm').test(text)) {
    return text.replace(new RegExp(`^${escapedKey}=.*$`, 'm'), line);
  }
  return `${text.trimEnd()}\n${line}\n`;
}

module.exports = function withAndroidGradleJvmArgs(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const propsPath = path.join(cfg.modRequest.platformProjectRoot, 'gradle.properties');
      let text = '';
      try {
        text = await fs.promises.readFile(propsPath, 'utf8');
      } catch {
        return cfg;
      }
      let next = text;
      if (/^org\.gradle\.jvmargs=/m.test(next)) {
        next = next.replace(/^org\.gradle\.jvmargs=.*$/m, `org.gradle.jvmargs=${JVM}`);
      } else {
        next = `${next.trimEnd()}\norg.gradle.jvmargs=${JVM}\n`;
      }
      next = ensureGradleProp(next, 'org.gradle.configuration-cache', 'false');
      await fs.promises.writeFile(propsPath, next, 'utf8');
      return cfg;
    },
  ]);
};
