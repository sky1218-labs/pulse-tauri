package dev.pulse.tauri.mediasession

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Receives the AlarmManager backup for the sleep-timer deadline. The
 * playback service's Handler schedule is precise while the service is
 * alive (it holds a wake lock while playing), but a Handler alone can be
 * deferred if the process is throttled; the alarm wakes the process and
 * re-checks the deadline in [PlaybackStore]. Explicit-component intent,
 * not exported.
 */
class SleepTimerAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != PlaybackStore.SLEEP_TIMER_ACTION) return
        PlaybackStore.onSleepAlarmFired(context)
    }
}
