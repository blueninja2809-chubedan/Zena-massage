/**
 * Sau `react_native_post_install`: nâng IPHONEOS_DEPLOYMENT_TARGET cho Pods (SDWebImage 9.0…),
 * và trên host Apple Silicon bỏ x86_64 khỏi simulator để tránh lỗi compile (vd. RNSVG + SDK mới).
 */
const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('@expo/config-plugins');

const MARKER = '# Zena-pod-min-deployment';

const EXTRA_RUBY = [
  '',
  `    ${MARKER}: SDWebImage / toolchain; M-series: skip x86_64 simulator slice.`,
  '    installer.pods_project.targets.each do |target|',
  '      target.build_configurations.each do |pod_cfg|',
  "        dep = pod_cfg.build_settings['IPHONEOS_DEPLOYMENT_TARGET']",
  "        if dep.nil? || Gem::Version.new(dep) < Gem::Version.new('15.1')",
  "          pod_cfg.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'",
  '        end',
  '      end',
  '    end',
  "    if `uname -m`.strip == 'arm64'",
  '      installer.pods_project.targets.each do |target|',
  '        target.build_configurations.each do |pod_cfg|',
  "          pod_cfg.build_settings['EXCLUDED_ARCHS[sdk=iphonesimulator*]'] = 'x86_64'",
  '        end',
  '      end',
  '    end',
].join('\n');

module.exports = function withIosPodInstallFixes(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = '';
      try {
        contents = await fs.promises.readFile(podfilePath, 'utf8');
      } catch {
        return cfg;
      }
      if (contents.includes(MARKER)) {
        return cfg;
      }
      const needle = `    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false,
      :ccache_enabled => ccache_enabled?(podfile_properties),
    )`;
      if (!contents.includes(needle)) {
        console.warn(
          '[withIosPodInstallFixes] Podfile missing react_native_post_install block; skip Podfile patch.',
        );
        return cfg;
      }
      await fs.promises.writeFile(podfilePath, contents.replace(needle, needle + EXTRA_RUBY), 'utf8');
      return cfg;
    },
  ]);
};
