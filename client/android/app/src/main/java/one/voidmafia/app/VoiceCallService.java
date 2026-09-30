package one.voidmafia.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

/**
 * Keeps a voice room alive while the app is in the background.
 *
 * Since Android 11 an app that is not on screen hears silence from the
 * microphone unless a foreground service of type "microphone" is running, and
 * without any foreground service the process can be frozen or killed — the
 * room went quiet both ways the moment the player switched apps. This service
 * is that foreground service: started from the page when it joins a voice
 * room (while on screen, which Android requires), stopped when it leaves.
 */
public class VoiceCallService extends Service {

    private static final String CHANNEL_ID = "voice_room";
    private static final int NOTIFICATION_ID = 4242;
    /** A safety net: a lost stop() must not hold the CPU awake for ever. */
    private static final long WAKE_LOCK_MAX_MS = 4L * 60 * 60 * 1000;

    private PowerManager.WakeLock wakeLock;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        createChannel();

        Intent open = new Intent(this, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tap = PendingIntent.getActivity(
            this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Void Mafia")
            .setContentText("ხმოვან ოთახში ხარ")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(tap)
            .setOngoing(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .build();

        // "microphone" only with the permission granted — asking for that type
        // without it throws. A listen-only player still keeps playback.
        int types = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED) {
            types |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
        }
        try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, types);
        } catch (RuntimeException e) {
            // Refused (started from the background, or a type not allowed):
            // voice keeps working on screen exactly as before, just not behind.
            stopSelf();
            return START_NOT_STICKY;
        }

        // Screen off: keep the CPU running so the audio does not stutter away.
        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "VoidMafia:voiceRoom");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire(WAKE_LOCK_MAX_MS);
            }
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
        super.onDestroy();
    }

    /** Swiping the app away ends the room; do not leave a notification behind. */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID, "ხმოვანი ოთახი", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("ჩანს, სანამ ხმოვან ოთახში ხარ");
        channel.setShowBadge(false);
        nm.createNotificationChannel(channel);
    }
}
