package ru.sluchaino.answerbook;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.os.Build;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PrintDocumentPlugin.class);
        registerPlugin(AppearancePlugin.class);
        super.onCreate(savedInstanceState);
        AppearancePlugin.applyTheme(this, "dark".equals(getSharedPreferences("CapacitorStorage", MODE_PRIVATE).getString("answerbook.theme.v1", "light")));
        // Web content owns both palettes; prevent Android from recoloring them.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getBridge().getWebView().setForceDarkAllowed(false);
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(getBridge().getWebView().getSettings(), false);
        }
    }
}
