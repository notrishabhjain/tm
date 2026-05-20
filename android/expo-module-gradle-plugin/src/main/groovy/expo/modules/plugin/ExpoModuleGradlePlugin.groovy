package expo.modules.plugin

import org.gradle.api.Plugin
import org.gradle.api.Project

class ExpoModuleGradlePlugin implements Plugin<Project> {
    @Override
    void apply(Project project) {
        // Apply Kotlin Android plugin for .kt source files
        try {
            project.plugins.apply('org.jetbrains.kotlin.android')
        } catch (Exception ignored) {
            try {
                project.plugins.apply('kotlin-android')
            } catch (Exception ignored2) {}
        }

        // safeExtGet reads from rootProject.ext (set in android/build.gradle's buildscript.ext)
        project.ext.safeExtGet = { String prop, Object fallback ->
            project.rootProject.ext.has(prop) ? project.rootProject.ext.get(prop) : fallback
        }

        project.ext.kotlinVersion = {
            project.rootProject.ext.has('kotlinVersion')
                ? project.rootProject.ext.get('kotlinVersion')
                : '1.9.24'
        }

        // Set SDK versions when com.android.library is applied
        project.plugins.withId('com.android.library') {
            project.android {
                compileSdkVersion project.ext.safeExtGet('compileSdkVersion', 34) as int
                defaultConfig {
                    minSdkVersion project.ext.safeExtGet('minSdkVersion', 23) as int
                    targetSdkVersion project.ext.safeExtGet('targetSdkVersion', 34) as int
                }
                lintOptions {
                    abortOnError false
                }
            }

            // Add expo-modules-core and kotlin-stdlib (equivalent to useCoreDependencies())
            project.dependencies {
                if (!project.name.startsWith('expo-modules-core')) {
                    add('implementation', project.project(':expo-modules-core'))
                }
                add('implementation', "org.jetbrains.kotlin:kotlin-stdlib-jdk7:${project.ext.kotlinVersion()}")
            }
        }
    }
}
