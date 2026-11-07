package ru.sluchaino.answerbook;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PrintDocument")
public class PrintDocumentPlugin extends Plugin {
    @PluginMethod
    public void print(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                PrintManager manager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                if (manager == null) { call.reject("Печать недоступна"); return; }
                manager.print("КодШаг", getBridge().getWebView().createPrintDocumentAdapter("КодШаг"), new PrintAttributes.Builder().build());
                call.resolve();
            } catch (Exception error) {
                call.reject("Не удалось открыть печать", error);
            }
        });
    }
}
