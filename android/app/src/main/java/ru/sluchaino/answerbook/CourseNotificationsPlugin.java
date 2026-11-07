package ru.sluchaino.answerbook;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import android.net.Uri;
import android.provider.Settings;
import androidx.work.WorkManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.net.URL;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name="CourseNotifications",permissions={@Permission(alias="notifications",strings={Manifest.permission.POST_NOTIFICATIONS})})
public class CourseNotificationsPlugin extends Plugin {
    private void resolve(PluginCall call){
        try{synchronized(CourseNotificationsStore.LOCK){
            JSONObject snapshot=CourseNotificationsStore.read(getContext());if(snapshot==null)throw new IllegalStateException("Notifications not initialized");
            boolean open=getActivity().getIntent().getBooleanExtra(CourseNotificationsStore.OPEN,false);getActivity().getIntent().removeExtra(CourseNotificationsStore.OPEN);
            JSObject result=new JSObject();result.put("snapshot",snapshot);result.put("enabled",CourseNotificationsStore.prefs(getContext()).getBoolean("enabled",false));result.put("permitted",CourseNotificationsStore.permitted(getContext()));result.put("openInbox",open);call.resolve(result);
        }}catch(Exception e){call.reject("Не удалось открыть уведомления");}
    }
    @PluginMethod public void configure(PluginCall call){
        try{synchronized(CourseNotificationsStore.LOCK){
            URL url=new URL(call.getString("url",""));if(!"https".equals(url.getProtocol())||url.getUserInfo()!=null)throw new IllegalArgumentException("HTTPS required");
            if(!CourseNotificationsStore.prefs(getContext()).edit().putString("url",url.toString()).commit())throw new IllegalStateException("Storage failed");
            CourseNotificationsStore.channel(getContext());CourseNotificationsStore.observe(getContext(),call.getObject("manifest"),false);
            if(CourseNotificationsStore.prefs(getContext()).getBoolean("enabled",false))CourseNotificationsStore.schedule(getContext());resolve(call);
        }}catch(Exception e){call.reject("Не удалось настроить уведомления: требуется HTTPS-каталог");}
    }
    @PluginMethod public void observe(PluginCall call){try{CourseNotificationsStore.observe(getContext(),call.getObject("manifest"),false);resolve(call);}catch(Exception e){call.reject("Не удалось сохранить уведомления");}}
    @PluginMethod public void state(PluginCall call){resolve(call);}
    @PluginMethod public void markRead(PluginCall call){
        try{synchronized(CourseNotificationsStore.LOCK){JSONObject snapshot=CourseNotificationsStore.read(getContext());JSONArray items=snapshot.getJSONArray("items");String id=call.getString("id");for(int i=0;i<items.length();i++){JSONObject n=items.getJSONObject(i);if(id==null||id.equals(n.getString("id")))n.put("read",true);}CourseNotificationsStore.save(getContext(),snapshot);resolve(call);}}catch(Exception e){call.reject("Не удалось сохранить прочтение");}
    }
    @PluginMethod public void enable(PluginCall call){
        if(Build.VERSION.SDK_INT>=33&&getPermissionState("notifications")!=PermissionState.GRANTED){requestPermissionForAlias("notifications",call,"permissionResult");return;}enableAllowed(call);
    }
    @PermissionCallback private void permissionResult(PluginCall call){enableAllowed(call);}
    private void enableAllowed(PluginCall call){
        CourseNotificationsStore.channel(getContext());
        boolean allowed=CourseNotificationsStore.permitted(getContext());
        if(!CourseNotificationsStore.prefs(getContext()).edit().putBoolean("enabled",allowed).commit()){call.reject("Не удалось сохранить настройку");return;}
        if(allowed)CourseNotificationsStore.schedule(getContext());else WorkManager.getInstance(getContext()).cancelUniqueWork(CourseNotificationsStore.WORK);resolve(call);
    }
    @PluginMethod public void disable(PluginCall call){
        if(!CourseNotificationsStore.prefs(getContext()).edit().putBoolean("enabled",false).commit()){call.reject("Не удалось сохранить настройку");return;}
        WorkManager.getInstance(getContext()).cancelUniqueWork(CourseNotificationsStore.WORK);resolve(call);
    }
    @PluginMethod public void openSettings(PluginCall call){
        Intent intent=Build.VERSION.SDK_INT>=26?new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,getContext().getPackageName()):new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getContext().getPackageName()));
        getActivity().startActivity(intent);call.resolve();
    }
    @Override protected void handleOnNewIntent(Intent intent){if(intent.getBooleanExtra(CourseNotificationsStore.OPEN,false)){getActivity().setIntent(intent);notifyListeners("openInbox",new JSObject(),true);}}
}
