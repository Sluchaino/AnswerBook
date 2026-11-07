package ru.sluchaino.answerbook;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONObject;

public class CourseUpdateWorker extends Worker {
    public CourseUpdateWorker(@NonNull Context context,@NonNull WorkerParameters parameters){super(context,parameters);}
    @NonNull @Override public Result doWork(){
        Context c=getApplicationContext();if(!CourseNotificationsStore.prefs(c).getBoolean("enabled",false))return Result.success();
        HttpURLConnection connection=null;
        try{
            URL url=new URL(CourseNotificationsStore.prefs(c).getString("url",""));
            if(!"https".equals(url.getProtocol())||url.getUserInfo()!=null)return Result.failure();
            connection=(HttpURLConnection)url.openConnection();connection.setConnectTimeout(15000);connection.setReadTimeout(15000);connection.setInstanceFollowRedirects(false);connection.setRequestProperty("Cache-Control","no-cache");
            if(connection.getResponseCode()!=200)return Result.retry();
            try(InputStream input=connection.getInputStream();ByteArrayOutputStream bytes=new ByteArrayOutputStream()){
                byte[] buffer=new byte[8192];int count,total=0;
                while((count=input.read(buffer))!=-1){total+=count;if(total>1000000)return Result.failure();bytes.write(buffer,0,count);if(isStopped())return Result.retry();}
                CourseNotificationsStore.observe(c,new JSONObject(bytes.toString("UTF-8")),true);
            }
            return Result.success();
        }catch(Exception e){return Result.retry();}finally{if(connection!=null)connection.disconnect();}
    }
}
