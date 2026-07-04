package com.taskmind.app
import expo.modules.splashscreen.SplashScreenManager

import android.content.Intent
import android.os.Build
import android.os.Bundle

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper
import expo.modules.notificationlistener.NotificationListenerModule

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    SplashScreenManager.registerOnActivity(this)
    super.onCreate(null)
    handleShareIntent(intent)
    handleNavRouteExtra(intent)
  }

  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    intent?.let {
      handleShareIntent(it)
      handleNavRouteExtra(it)
    }
  }

  private fun handleShareIntent(intent: Intent) {
    if (intent.action == Intent.ACTION_SEND && intent.type?.startsWith("text/") == true) {
      val text = intent.getStringExtra(Intent.EXTRA_TEXT) ?: return
      val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)
      NotificationListenerModule.setShareIntent(text, subject)
    }
  }

  // Notification taps and app shortcuts carry a target route as an extra.
  // Stash it in prefs; JS peeks popPendingNavRoute on launch/foreground.
  // (Covers the singleTask warm-start case where the cold-start pref written
  // by CallTranscriptionService was already consumed.)
  private fun handleNavRouteExtra(intent: Intent) {
    intent.getStringExtra("taskmind_nav_route")?.let {
      NotificationListenerModule.setPendingNavRoute(this, it)
    }
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}
