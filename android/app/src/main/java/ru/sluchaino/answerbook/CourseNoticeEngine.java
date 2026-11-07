package ru.sluchaino.answerbook;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.HashSet;
import java.util.Set;

/** Pure metadata diff. No theory downloads, arbitrary URLs or code execution. */
public final class CourseNoticeEngine {
    private static JSONObject find(JSONArray list,String id) throws JSONException {
        for(int i=0;i<list.length();i++)if(id.equals(list.getJSONObject(i).getString("id")))return list.getJSONObject(i);
        return null;
    }
    private static void text(JSONObject value,String field,boolean identifier) throws JSONException {
        Object raw=value.get(field);
        if(!(raw instanceof String)||((String)raw).trim().isEmpty()||((String)raw).length()>20000||identifier&&!((String)raw).matches("[a-z0-9][a-z0-9-]{0,119}"))throw new JSONException("Invalid "+field);
    }
    private static long number(JSONObject value,String field) throws JSONException {
        Object raw=value.get(field);
        if(!(raw instanceof Number))throw new JSONException("Invalid "+field);
        double d=((Number)raw).doubleValue();long n=((Number)raw).longValue();
        if(!Double.isFinite(d)||d!=n||n<1||n>9007199254740991L)throw new JSONException("Invalid "+field);
        return n;
    }
    private static void hash(JSONObject value) throws JSONException {
        if(value.has("contentHash")&&!value.isNull("contentHash")&&!value.getString("contentHash").matches("[a-f0-9]{64}"))throw new JSONException("Invalid hash");
    }
    public static void validate(JSONObject manifest) throws JSONException {
        if(manifest.getInt("schemaVersion")!=1)throw new JSONException("Invalid manifest");
        number(manifest,"revision");JSONArray courses=manifest.getJSONArray("courses");
        if(courses.length()>200)throw new JSONException("Too many courses");
        Set<String> ids=new HashSet<>();
        for(int i=0;i<courses.length();i++){
            JSONObject c=courses.getJSONObject(i);text(c,"id",true);number(c,"version");
            if(!ids.add(c.getString("id")))throw new JSONException("Duplicate course");
            JSONObject s=c.getJSONObject("summary");text(s,"title",false);
            if(!c.getString("id").equals(s.getString("id"))||number(c,"version")!=number(s,"version"))throw new JSONException("Invalid summary");
            JSONArray modules=s.getJSONArray("modules");if(modules.length()>100)throw new JSONException("Too many modules");
            Set<String> mids=new HashSet<>(),lids=new HashSet<>();
            for(int j=0;j<modules.length();j++){
                JSONObject m=modules.getJSONObject(j);text(m,"id",true);text(m,"title",false);hash(m);
                if(!mids.add(m.getString("id")))throw new JSONException("Duplicate module");
                JSONArray lessons=m.getJSONArray("lessons");if(lessons.length()>200)throw new JSONException("Too many lessons");
                for(int k=0;k<lessons.length();k++){
                    JSONObject l=lessons.getJSONObject(k);text(l,"id",true);text(l,"title",false);hash(l);
                    if(!lids.add(l.getString("id")))throw new JSONException("Duplicate lesson");
                }
            }
        }
    }
    private static boolean changed(JSONObject a,JSONObject b) throws JSONException {
        return !a.getString("title").equals(b.getString("title"))||a.has("contentHash")&&b.has("contentHash")&&!a.optString("contentHash").isEmpty()&&!b.optString("contentHash").isEmpty()&&!a.optString("contentHash").equals(b.optString("contentHash"));
    }
    public static JSONObject reconcile(JSONObject previous,JSONObject manifest,String now) throws JSONException {
        validate(manifest);
        if(previous==null)return new JSONObject().put("schemaVersion",1).put("baseline",manifest).put("items",new JSONArray());
        if(manifest.getLong("revision")<previous.getJSONObject("baseline").getLong("revision"))return previous;
        JSONArray items=new JSONArray(previous.getJSONArray("items").toString());
        JSONArray oldCourses=previous.getJSONObject("baseline").getJSONArray("courses"),courses=manifest.getJSONArray("courses");
        for(int i=0;i<courses.length();i++){
            JSONObject c=courses.getJSONObject(i),old=find(oldCourses,c.getString("id")),summary=c.getJSONObject("summary");
            if(old!=null&&c.getLong("version")<old.getLong("version"))throw new JSONException("Course version rollback");
            if(old!=null&&c.getLong("version")<=old.getLong("version"))continue;
            JSONArray changes=new JSONArray();
            if(old==null)changes.put("Новый курс");
            else if(old.has("summary")){
                JSONArray modules=summary.getJSONArray("modules"),priorModules=old.getJSONObject("summary").getJSONArray("modules");
                for(int j=0;j<modules.length();j++){
                    JSONObject m=modules.getJSONObject(j),prior=find(priorModules,m.getString("id"));
                    if(prior==null){changes.put("Новый модуль: "+m.getString("title"));continue;}
                    boolean lessonChanged=false;JSONArray lessons=m.getJSONArray("lessons");
                    for(int k=0;k<lessons.length();k++){
                        JSONObject l=lessons.getJSONObject(k),before=find(prior.getJSONArray("lessons"),l.getString("id"));
                        if(before==null){changes.put("Новый урок: "+l.getString("title"));lessonChanged=true;}
                        else if(changed(l,before)){changes.put("Обновлён урок: "+l.getString("title"));lessonChanged=true;}
                    }
                    if(!lessonChanged&&changed(m,prior))changes.put("Обновлён модуль: "+m.getString("title"));
                }
            }
            if(changes.length()==0)changes.put("Обновлены материалы курса");
            String id=c.getString("id")+":v"+c.getLong("version");
            if(find(items,id)==null){
                JSONObject notice=new JSONObject().put("id",id).put("courseId",c.getString("id")).put("version",c.getLong("version")).put("title",summary.getString("title")).put("createdAt",now).put("read",false).put("changes",changes);
                JSONArray next=new JSONArray().put(notice);for(int n=0;n<items.length()&&n<99;n++)next.put(items.getJSONObject(n));items=next;
            }
        }
        return new JSONObject().put("schemaVersion",1).put("baseline",manifest).put("items",items);
    }
}
