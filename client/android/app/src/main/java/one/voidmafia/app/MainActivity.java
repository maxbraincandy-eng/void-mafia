package one.voidmafia.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final int PERMISSION_REQUEST_CODE = 1001;

    private static final String[] REQUIRED_PERMISSIONS = {
        Manifest.permission.RECORD_AUDIO,
        Manifest.permission.CAMERA,
        Manifest.permission.MODIFY_AUDIO_SETTINGS,
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        configureWebView();
        requestRuntimePermissions();
    }

    /**
     * Configure WebView settings for WebRTC and full-screen game experience.
     */
    private void configureWebView() {
        WebView webView = getBridge().getWebView();
        WebSettings settings = webView.getSettings();

        // JavaScript (already enabled by Capacitor, but be explicit)
        settings.setJavaScriptEnabled(true);

        // Allow media autoplay without gesture — needed so incoming remote audio
        // from WebRTC peers plays automatically without a tap.
        settings.setMediaPlaybackRequiresUserGesture(false);

        // DOM storage for app state
        settings.setDomStorageEnabled(true);

        // Hardware acceleration is set in manifest; also enable in WebView
        webView.setLayerType(WebView.LAYER_TYPE_HARDWARE, null);

        // Expose a screenshot/recording guard the web app can toggle. Used by the
        // VOID IQ test to blank the screen (FLAG_SECURE) so questions can't be
        // captured for an AI. Only present in the native build — the web falls
        // back to a no-op when this interface is absent.
        webView.addJavascriptInterface(new ScreenSecurity(), "AndroidScreenSecurity");

        // Override WebChromeClient to auto-grant camera/mic requests from the page.
        // Android requires the runtime permissions to already be granted (handled below)
        // before the WebView can use them.
        webView.setWebChromeClient(new com.getcapacitor.BridgeWebChromeClient(getBridge()) {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                // Grant all requested resources (mic, camera) to the WebView.
                // The underlying Android runtime permissions are enforced separately
                // by requestRuntimePermissions() — this just forwards the grant to
                // the WebView's JS context so getUserMedia() resolves successfully.
                request.grant(request.getResources());
            }
        });
    }

    /**
     * Request microphone and camera runtime permissions on first launch.
     * These are needed before the WebView can access them via getUserMedia.
     */
    private void requestRuntimePermissions() {
        boolean allGranted = true;
        for (String perm : REQUIRED_PERMISSIONS) {
            if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                allGranted = false;
                break;
            }
        }
        if (!allGranted) {
            ActivityCompat.requestPermissions(this, REQUIRED_PERMISSIONS, PERMISSION_REQUEST_CODE);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        // Permissions have been responded to — the WebView will retry getUserMedia
        // on the next call from the page.  No additional action needed here.
    }

    /**
     * JS bridge: window.AndroidScreenSecurity.setSecure(true/false).
     * FLAG_SECURE blanks screenshots + screen recording and hides the app in the
     * recent-apps preview. Toggled on only while a proctored screen (VOID IQ test)
     * is on-screen, so the rest of the app can still be screenshotted normally.
     */
    public class ScreenSecurity {
        @JavascriptInterface
        public void setSecure(final boolean enabled) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (enabled) {
                        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
                    } else {
                        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
                    }
                }
            });
        }
    }
}
