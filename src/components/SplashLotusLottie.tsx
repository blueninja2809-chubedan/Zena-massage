import { useCallback, useRef } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

/**
 * Splash Lottie không dùng `lottie-react-native` (Fabric) — tránh lỗi
 * « Unimplemented component: LottieAnimationView » trên bản native.
 * Animation JSON giữ nguyên trong bundle; chỉ viện `lottie-web` qua CDN khi hiển thị.
 */

const LOTIE_WEB_CDN =
  'https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js';

const HTML_SHELL = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
html,body{margin:0;height:100%;background:transparent;display:flex;align-items:center;justify-content:center;}
#root{width:280px;height:280px}
</style></head><body><div id="root"></div></body></html>`;

type SplashLotusLottieProps = {
  animationData: Record<string, unknown>;
  loop: boolean;
  autoPlay?: boolean;
  onAnimationFinish?: (isCancelled: boolean) => void;
  style?: StyleProp<ViewStyle>;
};

export function SplashLotusLottie({
  animationData,
  loop,
  autoPlay = true,
  onAnimationFinish,
  style,
}: SplashLotusLottieProps) {
  const webRef = useRef<WebView>(null);
  const didInject = useRef(false);

  const loadLottie = useCallback(() => {
    if (didInject.current) return;
    didInject.current = true;
    const enc = encodeURIComponent(JSON.stringify(animationData));
    const loopStr = loop ? 'true' : 'false';
    const playStr = autoPlay ? 'true' : 'false';
    const js = `
      (function(){
        var enc = '${enc}';
        var data = JSON.parse(decodeURIComponent(enc));
        var s = document.createElement('script');
        s.src = '${LOTIE_WEB_CDN}';
        s.onload = function(){
          var anim = lottie.loadAnimation({
            container: document.getElementById('root'),
            renderer: 'svg',
            loop: ${loopStr},
            autoplay: ${playStr},
            animationData: data
          });
          anim.addEventListener('complete', function(){
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ t: 'complete' }));
            }
          });
        };
        s.onerror = function(){
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ t: 'script_error' }));
          }
        };
        document.head.appendChild(s);
      })();
      true;
    `;
    webRef.current?.injectJavaScript(js);
  }, [animationData, loop, autoPlay]);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      try {
        const d = JSON.parse(e.nativeEvent.data) as { t?: string };
        if (d.t === 'complete') onAnimationFinish?.(false);
      } catch {
        /* ignore */
      }
    },
    [onAnimationFinish],
  );

  return (
    <WebView
      ref={webRef}
      source={{ html: HTML_SHELL }}
      onLoadEnd={loadLottie}
      onMessage={onMessage}
      style={[{ width: 280, height: 280, backgroundColor: 'transparent' }, style]}
      scrollEnabled={false}
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      bounces={false}
      overScrollMode="never"
      androidLayerType="hardware"
      mixedContentMode="always"
      originWhitelist={['*']}
    />
  );
}
