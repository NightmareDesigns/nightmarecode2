package com.nightmaredesigns.nightmarecode2;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

public class MainActivity extends Activity {
    private static final int REQUEST_OPEN_FILE = 1;
    private static final int REQUEST_SAVE_FILE = 2;
    private static final int MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;
    private static final String APP_HOST = "appassets.androidplatform.net";

    private WebView webView;
    private ValueCallback<Uri[]> pendingFileChooser;
    private String pendingSaveContent;
    private int pendingSaveRequestId;
    private boolean savePickerOpen;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        webView.setBackgroundColor(0xFF050707);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setSupportMultipleWindows(false);

        webView.addJavascriptInterface(new AndroidBridge(), "androidApp");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                return !isAppAsset(uri);
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!isAppAsset(uri)) return blockedResponse();
                String assetPath = uri.getPath().substring("/assets/".length());
                if (assetPath.isEmpty() || assetPath.contains("..") || assetPath.contains("\\")) {
                    return blockedResponse();
                }
                try {
                    return new WebResourceResponse(mimeType(assetPath), "UTF-8", getAssets().open(assetPath));
                } catch (IOException error) {
                    return blockedResponse();
                }
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingFileChooser != null) pendingFileChooser.onReceiveValue(null);
                pendingFileChooser = callback;
                try {
                    startActivityForResult(params.createIntent(), REQUEST_OPEN_FILE);
                    return true;
                } catch (Exception error) {
                    pendingFileChooser = null;
                    callback.onReceiveValue(null);
                    return false;
                }
            }
        });

        setContentView(webView);
        webView.loadUrl("https://" + APP_HOST + "/assets/index.html");
    }

    private boolean isAppAsset(Uri uri) {
        return "https".equals(uri.getScheme())
                && APP_HOST.equals(uri.getHost())
                && uri.getPath() != null
                && uri.getPath().startsWith("/assets/");
    }

    private String mimeType(String assetPath) {
        if (assetPath.endsWith(".html")) return "text/html";
        if (assetPath.endsWith(".css")) return "text/css";
        if (assetPath.endsWith(".js")) return "application/javascript";
        return "application/octet-stream";
    }

    private WebResourceResponse blockedResponse() {
        return new WebResourceResponse(
                "text/plain",
                "UTF-8",
                404,
                "Not found",
                Collections.emptyMap(),
                new java.io.ByteArrayInputStream(new byte[0])
        );
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_OPEN_FILE) {
            if (pendingFileChooser != null) {
                pendingFileChooser.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                pendingFileChooser = null;
            }
            return;
        }
        if (requestCode != REQUEST_SAVE_FILE) return;

        boolean saved = resultCode == RESULT_OK && data != null && data.getData() != null;
        if (saved) {
            try (OutputStream output = getContentResolver().openOutputStream(data.getData(), "wt")) {
                if (output == null) throw new IOException("Could not open the selected destination.");
                output.write(pendingSaveContent.getBytes(StandardCharsets.UTF_8));
            } catch (IOException error) {
                saved = false;
                Toast.makeText(this, "Could not save text file.", Toast.LENGTH_LONG).show();
            }
        }
        pendingSaveContent = null;
        savePickerOpen = false;
        final boolean result = saved;
        webView.post(() -> webView.evaluateJavascript(
                "window.fileManager && window.fileManager.handleMobileSaveResult("
                        + pendingSaveRequestId + "," + result + ")",
                null
        ));
    }

    @Override
    protected void onDestroy() {
        if (pendingFileChooser != null) {
            pendingFileChooser.onReceiveValue(null);
            pendingFileChooser = null;
        }
        if (webView != null) {
            webView.removeJavascriptInterface("androidApp");
            webView.destroy();
        }
        super.onDestroy();
    }

    private final class AndroidBridge {
        @JavascriptInterface
        public void saveTextFile(String fileName, String content, int requestId) {
            if (content == null || content.getBytes(StandardCharsets.UTF_8).length > MAX_TEXT_FILE_BYTES) {
                runOnUiThread(() -> notifySaveResult(requestId, false));
                return;
            }

            runOnUiThread(() -> {
                if (savePickerOpen) {
                    notifySaveResult(requestId, false);
                    return;
                }
                String safeName = fileName == null ? "untitled.txt" : new File(fileName).getName();
                if (safeName.trim().isEmpty()) safeName = "untitled.txt";
                pendingSaveContent = content;
                pendingSaveRequestId = requestId;
                savePickerOpen = true;

                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("text/plain");
                intent.putExtra(Intent.EXTRA_TITLE, safeName);
                try {
                    startActivityForResult(intent, REQUEST_SAVE_FILE);
                } catch (Exception error) {
                    pendingSaveContent = null;
                    savePickerOpen = false;
                    notifySaveResult(requestId, false);
                }
            });
        }
    }

    private void notifySaveResult(int requestId, boolean saved) {
        webView.post(() -> webView.evaluateJavascript(
                "window.fileManager && window.fileManager.handleMobileSaveResult("
                        + requestId + "," + saved + ")",
                null
        ));
    }
}
