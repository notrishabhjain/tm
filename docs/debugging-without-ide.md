# Debugging Without an IDE

Since you have no local development environment, all debugging must happen via:
1. **CI logs** — GitHub Actions workflow logs
2. **In-app Diagnostics screen** — Settings → Diagnostics
3. **Diagnostics JSON export** — attach to GitHub Issues

---

## When the App Crashes

1. Open **Settings → Diagnostics → System** tab
2. Check the service status and permissions
3. Tap **Export** to generate `taskmind-diagnostics-{timestamp}.json`
4. File a GitHub Issue and attach the JSON

---

## When Notifications Aren't Being Captured

1. Open **Settings → Diagnostics → Notifications** tab
2. Check the last 50 captured notifications
3. Look for `FILTERED_OUT` status — means the app package isn't in your monitored list
4. Look for `DEDUPLICATED` — notification arrived twice within 5 seconds (normal)
5. If the tab is empty, the NLS service isn't running → check System tab → service status

---

## When Tasks Aren't Being Created

1. Open **Settings → Diagnostics → Extraction** tab
2. Find the notification that should have become a task
3. Check: rule score, matched keywords, final decision
4. If decision is `DISCARD`, check the discard reason:
   - `TOO_SHORT` — text < 3 words
   - `ANTI_PATTERN` — casual message pattern detected
   - `LOW_CONFIDENCE` — score below 0.40 threshold

---

## When a CI Build Fails

1. Open the failed workflow run in GitHub Actions
2. Expand the failed step
3. Look for the error message
4. If Gradle failed: look for the **failure-logs** artifact in the run
5. File an issue quoting the failing log section

---

## Reading Diagnostics JSON

The export contains:
```json
{
  "exportedAt": "ISO-8601",
  "appVersion": "0.1.0",
  "commitSha": "abc1234",
  "device": "model",
  "androidVersion": "13",
  "notifications": [...last 50 captured...],
  "extractions": [...last 50 decisions...],
  "discardedLog": [...all discarded items...],
  "dbStats": {...row counts...},
  "mmkvSettings": {...settings (secrets redacted)...},
  "permissions": {...permission statuses...},
  "serviceStatus": true/false
}
```

Attach this to every bug report.
