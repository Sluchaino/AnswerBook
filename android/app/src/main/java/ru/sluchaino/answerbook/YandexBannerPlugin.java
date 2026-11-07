package ru.sluchaino.answerbook;

import android.view.View;
import android.view.ViewGroup;
import android.view.Gravity;
import android.util.Log;
import android.widget.FrameLayout;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.yandex.mobile.ads.common.YandexAds;
import com.yandex.mobile.ads.common.AdRequest;
import com.yandex.mobile.ads.common.AdRequestError;
import com.yandex.mobile.ads.common.ImpressionData;
import com.yandex.mobile.ads.banner.BannerAdView;
import com.yandex.mobile.ads.banner.BannerAdSize;
import com.yandex.mobile.ads.banner.BannerAdEventListener;

/** Native banner occupies only the reserved WebView rectangle, never the navigation. */
@CapacitorPlugin(name = "YandexBanner")
public class YandexBannerPlugin extends Plugin {
    private boolean enabled, initialized, initializing, visible, paused;
    private boolean userConsent;
    private BannerAdView banner;
    private FrameLayout container;
    private float x, y, width, viewportWidth;
    private int adWidth, adHeight;
    private float scale = 1;

    @PluginMethod public void configure(PluginCall call) {
        boolean requested = BuildConfig.ADS_ENABLED && Boolean.TRUE.equals(call.getBoolean("enabled", false));
        boolean consent = Boolean.TRUE.equals(call.getBoolean("personalized", false));
        getActivity().runOnUiThread(() -> {
            if(userConsent!=consent)destroyBanner();
            userConsent=consent;
            enabled = requested;
            if (!enabled) {
                destroyBanner();
                if (initialized) {YandexAds.setUserConsent(false);YandexAds.setAppAdAnalyticsReporting(false);}
            } else {
                YandexAds.setUserConsent(userConsent);
                YandexAds.setAppAdAnalyticsReporting(userConsent);
                YandexAds.setLocationTracking(false);
                if (!initialized && !initializing) {
                    initializing = true;
                    YandexAds.initialize(getContext(), () -> getActivity().runOnUiThread(() -> {
                        initializing = false;
                        initialized = true;
                        YandexAds.setUserConsent(enabled&&userConsent);
                        YandexAds.setAppAdAnalyticsReporting(enabled&&userConsent);
                        render();
                        JSObject status = new JSObject(); status.put("enabled", enabled); call.resolve(status);
                    }));
                    return;
                }
                render();
            }
            JSObject status = new JSObject(); status.put("enabled", enabled); call.resolve(status);
        });
    }

    @PluginMethod public void frame(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            x = call.getFloat("x", 0f); y = call.getFloat("y", 0f);
            width = call.getFloat("width", 0f); viewportWidth = call.getFloat("viewportWidth", 0f);
            visible = Boolean.TRUE.equals(call.getBoolean("visible", false));
            render();
            JSObject result = new JSObject();
            result.put("height", adHeight > 0 ? adHeight / scale : 0);
            call.resolve(result);
        });
    }

    private void render() {
        if (!enabled || !initialized || paused || getActivity().isDestroyed()) return;
        if (!visible || width <= 0 || viewportWidth <= 0) {
            // Destroy rather than merely cover the view: stop automatic refreshes while hidden.
            destroyBanner(); return;
        }
        View web = getBridge().getWebView();
        scale = web.getWidth() / viewportWidth;
        if (scale <= 0) return;
        int widthDp = Math.max(1, Math.round(width * scale / getContext().getResources().getDisplayMetrics().density));
        if (banner != null && adWidth != widthDp) destroyBanner();
        if (banner == null) {
            adWidth = widthDp;
            BannerAdSize size = BannerAdSize.fixed(getContext(), widthDp, 50);
            adHeight = size.getHeightInPixels(getContext());
            JSObject dimensions = new JSObject();
            dimensions.put("height", adHeight / scale);
            notifyListeners("size", dimensions);
            container = new FrameLayout(getActivity());
            ((ViewGroup) getActivity().findViewById(android.R.id.content)).addView(container);
            banner = new BannerAdView(getActivity());
            banner.setAdSize(size);
            container.addView(banner, new FrameLayout.LayoutParams(size.getWidthInPixels(getContext()), adHeight, Gravity.CENTER_HORIZONTAL));
            final BannerAdView current = banner;
            banner.setBannerAdEventListener(new BannerAdEventListener() {
                @Override public void onAdLoaded() {
                    if (current != banner || !enabled || paused || getActivity().isDestroyed()) current.destroy();
                    else { if (container != null) container.setVisibility(View.VISIBLE); Log.i("KodShagAds", "Banner loaded: " + adWidth + "dp x 50dp"); }
                }
                @Override public void onAdFailedToLoad(@NonNull AdRequestError error) {
                    Log.w("KodShagAds", "Banner load failed: " + error.getCode() + "; " + error.getDescription());
                    // No immediate retries. SDK/network failures must not block the course.
                    if (current == banner && container != null) container.setVisibility(View.INVISIBLE);
                }
                @Override public void onAdClicked() {}
                @Override public void onImpression(@Nullable ImpressionData data) {}
            });
            // Never generate real impressions during development.
            String unit = BuildConfig.DEBUG ? "demo-banner-yandex" : "R-M-20345959-1";
            Log.i("KodShagAds", "Loading " + unit + ": " + widthDp + "dp x 50dp");
            banner.loadAd(new AdRequest.Builder(unit).build());
        }
        int[] webLocation = new int[2], parentLocation = new int[2];
        web.getLocationInWindow(webLocation);
        ViewGroup parent = (ViewGroup) container.getParent();
        parent.getLocationInWindow(parentLocation);
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(Math.round(width * scale), adHeight);
        params.leftMargin = webLocation[0] - parentLocation[0] + Math.round(x * scale);
        params.topMargin = webLocation[1] - parentLocation[1] + Math.round(y * scale);
        container.setLayoutParams(params);
    }

    private void destroyBanner() {
        if (banner != null) { banner.setBannerAdEventListener(null); banner.destroy(); banner = null; }
        if (container != null) {
            if (container.getParent() instanceof ViewGroup parent) parent.removeView(container);
            container = null;
        }
        adWidth = 0; adHeight = 0;
    }
    @Override protected void handleOnPause() { paused = true; destroyBanner(); }
    @Override protected void handleOnResume() { paused = false; render(); }
    @Override protected void handleOnDestroy() { enabled = false; destroyBanner(); }
}
