package ru.sluchaino.answerbook;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import androidx.core.view.WindowCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Appearance")
public class AppearancePlugin extends Plugin {
    static void applyTheme(Activity activity, boolean dark) {
        activity.getTheme().applyStyle(dark ? R.style.PaletteDark : R.style.PaletteLight, true);
        int color = Color.parseColor(dark ? "#101625" : "#f3f5fa");
        activity.getWindow().setBackgroundDrawable(new ColorDrawable(color));
        activity.getWindow().getDecorView().setBackgroundColor(color);
        var controller = WindowCompat.getInsetsController(activity.getWindow(), activity.getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(!dark);
        controller.setAppearanceLightNavigationBars(!dark);
    }

    @PluginMethod
    public void setTheme(PluginCall call) {
        String theme = call.getString("theme");
        if (!"light".equals(theme) && !"dark".equals(theme)) { call.reject("Неизвестная тема"); return; }
        getActivity().runOnUiThread(() -> { applyTheme(getActivity(), "dark".equals(theme)); call.resolve(); });
    }
}
