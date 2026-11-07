package ru.sluchaino.answerbook;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class CourseNotificationsStore {
    static final Object LOCK=new Object();
    static final String CHANNEL="course_updates",WORK="answerbook-course-updates",OPEN="answerbook.open.updates";
    static volatile boolean foreground=false;
    static SharedPreferences prefs(Context c){return c.getSharedPreferences("AnswerBookCourseNotifications",Context.MODE_PRIVATE);}
    static JSONObject read(Context c)throws JSONException {
        String saved=prefs(c).getString("snapshot",null);return saved==null?null:new JSONObject(saved);
    }
    static void save(Context c,JSONObject snapshot)throws JSONException {
        if(!prefs(c).edit().putString("snapshot",snapshot.toString()).commit())throw new JSONException("Cannot persist notifications");
    }
    static void channel(Context c){
        if(Build.VERSION.SDK_INT>=26){NotificationChannel channel=new NotificationChannel(CHANNEL,"Обновления материалов",NotificationManager.IMPORTANCE_DEFAULT);channel.setDescription("Новые курсы, модули и уроки КодШаг");c.getSystemService(NotificationManager.class).createNotificationChannel(channel);}
    }
    static boolean permitted(Context c){
        if(!NotificationManagerCompat.from(c).areNotificationsEnabled())return false;
        if(Build.VERSION.SDK_INT>=26){NotificationChannel ch=c.getSystemService(NotificationManager.class).getNotificationChannel(CHANNEL);if(ch!=null&&ch.getImportance()==NotificationManager.IMPORTANCE_NONE)return false;}
        return true;
    }
    static void schedule(Context c){
        Constraints constraints=new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).setRequiresBatteryNotLow(true).build();
        PeriodicWorkRequest work=new PeriodicWorkRequest.Builder(CourseUpdateWorker.class,1,TimeUnit.HOURS).setConstraints(constraints).build();
        WorkManager.getInstance(c).enqueueUniquePeriodicWork(WORK,ExistingPeriodicWorkPolicy.KEEP,work);
    }
    static void observe(Context c,JSONObject manifest,boolean system)throws JSONException {
        synchronized(LOCK){
            SimpleDateFormat clock=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",Locale.US);clock.setTimeZone(TimeZone.getTimeZone("UTC"));
            JSONObject before=read(c),next=CourseNoticeEngine.reconcile(before,manifest,clock.format(new Date()));
            Set<String> seen=new HashSet<>();if(before!=null){JSONArray old=before.getJSONArray("items");for(int i=0;i<old.length();i++)seen.add(old.getJSONObject(i).getString("id"));}
            save(c,next);
            if(system&&!foreground&&prefs(c).getBoolean("enabled",false)&&permitted(c)){
                JSONArray items=next.getJSONArray("items"),fresh=new JSONArray();for(int i=0;i<items.length();i++)if(!seen.contains(items.getJSONObject(i).getString("id")))fresh.put(items.getJSONObject(i));
                if(fresh.length()>0)notify(c,fresh);
            }
        }
    }
    private static void notify(Context c,JSONArray items)throws JSONException {
        channel(c);JSONObject first=items.getJSONObject(0);
        String title=items.length()==1?first.getString("title"):"Новые материалы: "+items.length()+" курсов";
        String body=first.getJSONArray("changes").getString(0);if(items.length()>1)body=first.getString("title")+" и другие курсы. Откройте список обновлений.";
        if(title.length()>120)title=title.substring(0,120);if(body.length()>300)body=body.substring(0,300);
        Intent intent=new Intent(c,MainActivity.class).putExtra(OPEN,true).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending=PendingIntent.getActivity(c,8101,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        try{NotificationManagerCompat.from(c).notify(8101,new NotificationCompat.Builder(c,CHANNEL).setSmallIcon(R.drawable.ic_stat_book).setContentTitle(title).setContentText(body).setStyle(new NotificationCompat.BigTextStyle().bigText(body)).setContentIntent(pending).setAutoCancel(true).build());}catch(SecurityException ignored){/* Permission may be revoked between check and delivery. */}
    }
}
