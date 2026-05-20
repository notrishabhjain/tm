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

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    SplashScreenManager.registerOnActivity(this)
    super.onCreate(null)
    handleShareIntent(intent)
  }

  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    intent?.let { handleShareIntent(it) }
  }

  private fun handleShareIntent(intent: Intent) {
    if (intent.action == Intent.ACTION_SEND && intent.type?.startsWith("text/") == true) {
      val text = intent.getStringExtra(Intent.EXTRA_TEXT) ?: return
      val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)
      pendingShareText = text
      pendingShareSubject = subject
    }
  }

  companion object {
    @Volatile var pendingShareText: String? = null
    @Volatile var pendingShareSubject: String? = null

    fun popShareIntent(): Map<String, String?>? {
      val text = pendingShareText ?: return null
      val subject = pendingShareSubject
      pendingShareText = null
      pendingShareSubject = null
      return mapOf("text" to text, "subject" to subject)
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
