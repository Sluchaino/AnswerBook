package ru.sluchaino.answerbook;

import org.junit.Test;
import org.json.JSONArray;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;

public class CourseNoticeEngineTest {
    private static String canonical(Object value) throws Exception {
        if(value instanceof JSONObject){
            JSONObject object=(JSONObject)value;java.util.TreeSet<String> keys=new java.util.TreeSet<>();object.keys().forEachRemaining(keys::add);
            StringBuilder result=new StringBuilder("{");for(String key:keys)result.append(JSONObject.quote(key)).append(':').append(canonical(object.get(key))).append(',');return result.append('}').toString();
        }
        if(value instanceof JSONArray){JSONArray array=(JSONArray)value;StringBuilder result=new StringBuilder("[");for(int i=0;i<array.length();i++)result.append(canonical(array.get(i))).append(',');return result.append(']').toString();}
        return value instanceof String?JSONObject.quote((String)value):String.valueOf(value);
    }
    @Test public void nativeAndBrowserUseTheSameReleaseDiff() throws Exception {
        JSONArray cases;
        try(var input=getClass().getResourceAsStream("/course-notice-cases.json")){
            assertNotNull(input);cases=new JSONArray(new String(input.readAllBytes(),StandardCharsets.UTF_8));
        }
        for(int i=0;i<cases.length();i++){
            JSONObject c=cases.getJSONObject(i);JSONObject previous=c.isNull("previous")?null:c.getJSONObject("previous");
            if(c.optBoolean("reject")){
                try{CourseNoticeEngine.reconcile(previous,c.getJSONObject("manifest"),c.getString("now"));fail(c.getString("name"));}catch(org.json.JSONException expected){}
            }else{
                JSONObject result=CourseNoticeEngine.reconcile(previous,c.getJSONObject("manifest"),c.getString("now"));
                assertEquals(c.getString("name"),canonical(c.getJSONObject("expected")),canonical(result));
            }
        }
    }
    @Test public void invalidBackgroundCatalogIsRejected() throws Exception {
        try{CourseNoticeEngine.validate(new JSONObject("{\"schemaVersion\":1,\"revision\":1,\"courses\":[{}]}"));fail("Malformed catalog accepted");}catch(org.json.JSONException expected){}
    }
}
