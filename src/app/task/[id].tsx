import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Calendar from 'expo-calendar';
import { Colors, getPriorityColor } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { PriorityChip } from '@/ui/components/PriorityChip';
import { Button } from '@/ui/components/Button';
import { Screen, LargeHeader } from '@/ui/components/Screen';
import { TaskRepository } from '@/data/repositories/TaskRepository';
import { db } from '@/data/db/client';

const taskRepo = new TaskRepository(db);

async function addToCalendar(
  title: string,
  notes: string | null,
  dueDate: number | null
): Promise<string | null> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission Required', 'Calendar access is needed to add this task as an event.');
    return null;
  }

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = calendars.find(
    (c) => c.allowsModifications && c.type !== Calendar.CalendarType.BIRTHDAYS
  );
  if (!writable) {
    Alert.alert('No Calendar', 'No writable calendar found on this device.');
    return null;
  }

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let start: Date;
  if (dueDate) {
    start = new Date(dueDate);
    start.setHours(9, 0, 0, 0);
  } else {
    start = new Date();
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
  }
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const eventId = await Calendar.createEventAsync(writable.id, {
    title,
    notes: notes ?? undefined,
    startDate: start,
    endDate: end,
    timeZone,
    alarms: [{ relativeOffset: -30 }],
  });
  return eventId ?? null;
}

export default function TaskDetailScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [calendarAdded, setCalendarAdded] = useState(false);
  const theme = useTheme();

  const { data: task, isLoading } = useQuery({
    queryKey: ['task', id],
    queryFn: () => taskRepo.getTaskById(id ?? ''),
    enabled: !!id,
  });

  const completeMutation = useMutation({
    mutationFn: () => taskRepo.completeTask(id ?? ''),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      router.back();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => taskRepo.deleteTask(id ?? ''),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      router.back();
    },
  });

  const handleAddToCalendar = (): void => {
    if (!task) return;
    void (async () => {
      try {
        const eventId = await addToCalendar(task.title, task.body, task.dueDate ?? null);
        if (eventId) {
          await taskRepo.setCalendarEvent(task.id, eventId);
          setCalendarAdded(true);
        }
      } catch (err) {
        Alert.alert('Calendar Error', String(err));
      }
    })();
  };

  const handleDelete = (): void => {
    Alert.alert('Delete Task', 'This task will be moved to history.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  };

  if (isLoading) {
    return (
      <Screen>
        <View style={styles.loading}>
          <Text style={[styles.loadingText, { color: theme.onSurfaceVariant }]}>Loading…</Text>
        </View>
      </Screen>
    );
  }

  if (!task) {
    return (
      <Screen>
        <LargeHeader title="Task" onBack={() => router.back()} />
        <View style={styles.loading}>
          <Text style={[styles.loadingText, { color: theme.onSurfaceVariant }]}>
            Task not found — it may have been deleted.
          </Text>
        </View>
      </Screen>
    );
  }

  const priorityColor = getPriorityColor(task.priority);

  return (
    <Screen>
      <LargeHeader
        title="Task"
        onBack={() => router.back()}
        right={<PriorityChip priority={task.priority} />}
      />

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* Title with priority accent */}
        <View style={styles.titleRow}>
          <View style={[styles.accent, { backgroundColor: priorityColor }]} />
          <Text style={[styles.taskTitle, { color: theme.onSurface }]} selectable>
            {task.title}
          </Text>
        </View>

        {/* Details card */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outline }]}>
          <InfoRow
            label="Source"
            value={task.sourceApp.split('.').pop() ?? task.sourceApp}
            theme={theme}
          />
          {task.sender && <InfoRow label="From" value={task.sender} theme={theme} />}
          <InfoRow
            label="Captured"
            value={new Date(task.createdAt).toLocaleString('en-IN')}
            theme={theme}
          />
          {task.dueDate && (
            <InfoRow
              label="Due"
              value={new Date(task.dueDate).toLocaleDateString('en-IN', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
              theme={theme}
            />
          )}
          <InfoRow
            label="Confidence"
            value={`${Math.round(task.confidence * 100)}%`}
            last
            theme={theme}
          />
        </View>

        {/* Calendar button */}
        <Pressable
          style={({ pressed }) => [
            styles.calendarBtn,
            {
              backgroundColor: calendarAdded ? Colors.successBg : theme.surfaceVariant,
            },
            pressed && !calendarAdded && { opacity: 0.7 },
          ]}
          onPress={handleAddToCalendar}
          disabled={calendarAdded}
          accessibilityRole="button"
        >
          <Ionicons
            name={calendarAdded ? 'checkmark-circle' : 'calendar-outline'}
            size={18}
            color={calendarAdded ? Colors.success : theme.onSurface}
          />
          <Text
            style={[
              styles.calendarBtnText,
              { color: calendarAdded ? Colors.success : theme.onSurface },
            ]}
          >
            {calendarAdded ? 'Added to calendar' : 'Add to calendar'}
          </Text>
        </Pressable>

        {/* Original message */}
        {task.body && (
          <>
            <Text style={[styles.originalLabel, { color: theme.onSurfaceVariant }]}>
              Original message
            </Text>
            <View style={[styles.messageCard, { backgroundColor: theme.surfaceVariant }]}>
              <Text style={[styles.originalText, { color: theme.onSurface }]} selectable>
                {task.body}
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* Action bar */}
      <View
        style={[
          styles.actionBar,
          { borderTopColor: theme.outline, backgroundColor: theme.background },
        ]}
      >
        <Button
          label="Mark complete"
          variant="primary"
          onPress={() => completeMutation.mutate()}
          loading={completeMutation.isPending}
          style={styles.completeButton}
        />
        <Button
          label="Delete"
          variant="destructive"
          onPress={handleDelete}
          loading={deleteMutation.isPending}
          style={styles.deleteButton}
          fullWidth={false}
        />
      </View>
    </Screen>
  );
}

function InfoRow({
  label,
  value,
  last = false,
  theme,
}: {
  label: string;
  value: string;
  last?: boolean;
  theme: ReturnType<typeof useTheme>;
}): React.JSX.Element {
  return (
    <View
      style={[
        styles.infoRow,
        !last && { borderBottomWidth: 0.5, borderBottomColor: theme.outline },
      ]}
    >
      <Text style={[styles.infoLabel, { color: theme.onSurfaceVariant }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: theme.onSurface }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  loadingText: { fontSize: 15, textAlign: 'center' },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 20, gap: 16, paddingBottom: 24, paddingTop: 4 },

  titleRow: { flexDirection: 'row', gap: 12 },
  accent: { width: 4, borderRadius: 2, alignSelf: 'stretch' },
  taskTitle: { fontSize: 22, fontWeight: '700', lineHeight: 30, flex: 1, letterSpacing: -0.3 },

  card: { borderRadius: 16, borderWidth: 0.5, paddingHorizontal: 16 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 13 },
  infoLabel: { fontSize: 14 },
  infoValue: { fontSize: 14, flex: 1, textAlign: 'right', fontWeight: '500', marginLeft: 12 },

  calendarBtn: {
    height: 50,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarBtnText: { fontSize: 15, fontWeight: '600' },

  originalLabel: { fontSize: 13, fontWeight: '600', marginBottom: -4, marginLeft: 4 },
  messageCard: { borderRadius: 16, padding: 16 },
  originalText: { fontSize: 14, lineHeight: 21, fontFamily: 'JetBrainsMono-Regular' },

  actionBar: { flexDirection: 'row', padding: 16, gap: 12, borderTopWidth: 0.5 },
  completeButton: { flex: 1 },
  deleteButton: { minWidth: 100 },
});
