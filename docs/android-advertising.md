# Android advertising

Updated behavior is documented in `advertising-choice-2026-11-06.md`: refusal no longer disables banners, and fixed 320×50 replaces adaptive sticky. The original integration notes below describe the preceding version.

Yandex Mobile Ads 8.6.0; native Capacitor plugin `YandexBanner`.

- Release banner unit: `R-M-20345959-1`. Its type and moderation status must be confirmed in the publisher console; the ID alone cannot prove either.
- Debug builds always request `demo-banner-yandex`, even if the release unit changes.
- No website SDK or advertisements were added.
- Automatic SDK initialization is disabled by manifest metadata. Initialization occurs only after a separate, versioned opt-in, following privacy acknowledgement. A refusal allows learning and makes no ad requests. Consent is passed on every new process session before initialization.
- The profile has an advertising settings entry. Revocation destroys the banner and stops new advertising requests. It does not promise deletion of data already sent or unloading SDK code from a running process.
- No course answers, authored questions, course progress, identity or custom targeting parameters are passed to the ad SDK. `setLocationTracking(false)` disables location tracking; no location permission is requested.
- AppMetrica components are SDK dependencies; the policy discloses this. There is no separately configured learning-event analytics.
- Native positioning follows the reserved HTML banner rectangle, using WebView pixel/CSS scaling and window offsets. SDK size is returned to CSS, including after asynchronous initialization.
- Native banners are destroyed when the app is paused, a modal opens, an input is focused, consent is withdrawn, or the React host unmounts. No immediate retries or custom refresh timer are used. Sticky refresh is managed by the SDK.
- SDK adds network-state and advertising-ID permissions. Include them and the SDK data processing in the store declarations.

## Verification

Run `npm run build`, `npm test` and Android `:app:compileDebugJavaWithJavac :app:testDebugUnitTest` using project JDK 21. Generated public policy: `public/privacy.html`.

Before publication, on an Android device verify both consent choices, withdrawal and re-enabling, portrait/landscape positioning, keyboard and dialogs, offline learning, background/resume, and demonstration banner interactions. Confirm the ID is a banner unit and that the application has passed Yandex moderation. Real ad delivery, revenue, and physical-device layout are not established by compilation or unit tests.

Official references:

- https://ads.yandex.com/helpcenter/ru/dev/android/quick-start
- https://ads.yandex.com/helpcenter/en/dev/android/adaptive-sticky-banner
- https://ads.yandex.com/helpcenter/ru/dev/android/gdpr
- https://ads.yandex.com/helpcenter/ru/dev/android/app-privacy-android
- https://ads.yandex.com/helpcenter/ru/support/faq/sdk-integration
