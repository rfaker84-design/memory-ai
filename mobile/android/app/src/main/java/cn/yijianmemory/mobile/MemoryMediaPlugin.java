package cn.yijianmemory.mobile;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.util.Base64;
import android.provider.MediaStore;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.InputStream;
import java.io.OutputStream;
import java.io.ByteArrayOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "MemoryMedia")
public class MemoryMediaPlugin extends Plugin {
    private static final long MAX_IMAGE_BYTES = 20L * 1024L * 1024L;
    private static final long MAX_AUDIO_BYTES = 100L * 1024L * 1024L;

    @PluginMethod
    public void pickMedia(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "image/*", "audio/*" });
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "pickMediaResult");
    }

    @ActivityCallback
    private void pickMediaResult(PluginCall call, ActivityResult result) {
        if (call == null || result.getResultCode() != android.app.Activity.RESULT_OK || result.getData() == null) {
            if (call != null) call.reject("MEDIA_PICK_CANCELLED");
            return;
        }
        Intent data = result.getData();
        JSArray items = new JSArray();
        if (data.getClipData() != null) {
            for (int index = 0; index < data.getClipData().getItemCount(); index++) items.put(toItem(data.getClipData().getItemAt(index).getUri()));
        } else if (data.getData() != null) {
            items.put(toItem(data.getData()));
        }
        JSObject response = new JSObject();
        response.put("items", items);
        call.resolve(response);
    }

    private JSObject toItem(Uri uri) {
        ContentResolver resolver = getContext().getContentResolver();
        try { resolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (SecurityException ignored) { }
        JSObject item = new JSObject();
        item.put("uri", uri.toString());
        item.put("mimeType", resolver.getType(uri) == null ? "application/octet-stream" : resolver.getType(uri));
        item.put("name", uri.getLastPathSegment() == null ? "memory-media" : uri.getLastPathSegment());
        return item;
    }

    @PluginMethod
    public void readMedia(PluginCall call) {
        String rawUri = call.getString("uri");
        if (rawUri == null) { call.reject("MEDIA_URI_REQUIRED"); return; }
        Uri uri = Uri.parse(rawUri);
        if (!"content".equals(uri.getScheme())) { call.reject("UNSUPPORTED_MEDIA_URI"); return; }

        ContentResolver resolver = getContext().getContentResolver();
        String mimeType = resolver.getType(uri);
        long maximumBytes = mimeType != null && mimeType.startsWith("image/")
            ? MAX_IMAGE_BYTES
            : mimeType != null && mimeType.startsWith("audio/") ? MAX_AUDIO_BYTES : -1;
        if (maximumBytes < 0) { call.reject("UNSUPPORTED_MEDIA_TYPE"); return; }

        try (InputStream input = resolver.openInputStream(uri); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (input == null) throw new IllegalStateException("MEDIA_OPEN_FAILED");
            byte[] buffer = new byte[32 * 1024];
            long sizeBytes = 0;
            for (int read; (read = input.read(buffer)) != -1;) {
                sizeBytes += read;
                if (sizeBytes > maximumBytes) { call.reject("MEDIA_FILE_TOO_LARGE"); return; }
                output.write(buffer, 0, read);
            }
            JSObject response = new JSObject();
            response.put("base64", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
            response.put("sizeBytes", sizeBytes);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("MEDIA_READ_FAILED");
        }
    }

    @PluginMethod
    public void saveVideo(PluginCall call) {
        String signedUrl = call.getString("signedUrl");
        String fileName = call.getString("fileName", "memoryai-video.mp4");
        String mimeType = call.getString("mimeType", "video/mp4");
        if (signedUrl == null || !signedUrl.startsWith("https://")) { call.reject("SIGNED_VIDEO_URL_REQUIRED"); return; }
        execute(() -> streamToMediaStore(call, signedUrl, fileName, mimeType));
    }

    private void streamToMediaStore(PluginCall call, String signedUrl, String fileName, String mimeType) {
        HttpURLConnection connection = null;
        Uri outputUri = null;
        try {
            connection = (HttpURLConnection) new URL(signedUrl).openConnection();
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(60000);
            if (connection.getResponseCode() < 200 || connection.getResponseCode() >= 300) throw new IllegalStateException("SIGNED_VIDEO_DOWNLOAD_FAILED");
            ContentValues values = new ContentValues();
            values.put(MediaStore.Video.Media.DISPLAY_NAME, fileName);
            values.put(MediaStore.Video.Media.MIME_TYPE, mimeType);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/MemoryAI");
                values.put(MediaStore.Video.Media.IS_PENDING, 1);
            }
            ContentResolver resolver = getContext().getContentResolver();
            outputUri = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values);
            if (outputUri == null) throw new IllegalStateException("MEDIA_STORE_WRITE_FAILED");
            try (InputStream input = connection.getInputStream(); OutputStream output = resolver.openOutputStream(outputUri)) {
                if (output == null) throw new IllegalStateException("MEDIA_STORE_WRITE_FAILED");
                byte[] buffer = new byte[32 * 1024];
                for (int read; (read = input.read(buffer)) != -1;) output.write(buffer, 0, read);
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) { values.clear(); values.put(MediaStore.Video.Media.IS_PENDING, 0); resolver.update(outputUri, values, null, null); }
            JSObject response = new JSObject(); response.put("uri", outputUri.toString()); call.resolve(response);
        } catch (Exception error) {
            if (outputUri != null) getContext().getContentResolver().delete(outputUri, null, null);
            call.reject("VIDEO_SAVE_FAILED", error);
        } finally { if (connection != null) connection.disconnect(); }
    }
}
