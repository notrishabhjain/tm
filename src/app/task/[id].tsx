import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Calendar from 'expo-calendar';
import { Colors, getPriorityColor } from '@/ui/theme/colors';
import { PriorityChip } from '@/ui/components/PriorityChip';
import { Button } from '@/ui/components/Button';
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
          Alert.alert('Added to Calendar', 'Task has been added as a calendar event.');
        }
      } catch (err) {
        Alert.alert('Calendar Error', String(err));
      }
    })();
  };

  const handleDelete = (): void => {
    Alert.alert('Delete Task', 'This task will be moved to history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteMutation.mutate(),
      },
    ]);
  };

  if (isLoading || !task) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  const priorityColor = getPriorityColor(task.priority);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: priorityColor }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
        >
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <PriorityChip priority={task.priority} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* Task title */}
        <Text style={styles.taskTitle} selectable>
          {task.title}
        </Text>

        {/* Source info */}
        <View style={styles.sourceCard}>
          <InfoRow label="Source" value={task.sourceApp.split('.').pop() ?? task.sourceApp} />
          {task.sender && <InfoRow label="From" value={task.sender} />}
          <InfoRow label="Captured" value={new Date(task.createdAt).toLocaleString('en-IN')} />
          {task.dueDate && (
            <InfoRow
              label="Due"
              value={new Date(task.dueDate).toLocaleDateString('en-IN', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            />
          )}
          <InfoRow label="Confidence" value={`${Math.round(task.confidence * 100)}%`} />
        </View>

        {/* Calendar button */}
        <Pressable
          style={[styles.calendarBtn, calendarAdded && styles.calendarBtnDone]}
          onPress={handleAddToCalendar}
          disabled={calendarAdded}
        >
          <Text style={styles.calendarBtnText}>
            {calendarAdded ? '✓ Added to Calendar' : '+ Add to Calendar'}
          </Text>
        </Pressable>

        {/* Body / original message */}
        {task.body && (
          <View style={styles.originalCard}>
            <Text style={styles.originalLabel}>Original message</Text>
            <Text style={styles.originalText} selectable>
              {task.body}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Action bar */}
      <View style={styles.actionBar}>
        <Button
          label="Mark Complete"
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
        />
      </View>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundLight },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: Colors.onSurfaceVariantLight },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: Colors.surfaceLight,
    borderBottomWidth: 3,
  },
  backButton: { padding: 4 },
  backText: { fontSize: 16, color: Colors.primary500, fontWeight: '600' },
  body: { flex: 1 },
  bodyContent: { padding: 16, gap: 16 },
  taskTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.onSurfaceLight,
    lineHeight: 28,
  },
  sourceCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
    padding: 12,
    elevation: 1,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineLight,
  },
  infoLabel: { fontSize: 13, color: Colors.onSurfaceVariantLight, fontWeight: '500' },
  infoValue: { fontSize: 13, color: Colors.onSurfaceLight, flex: 1, textAlign: 'right' },
  originalCard: {
    backgroundColor: Colors.surfaceVariantLight,
    borderRadius: 8,
    padding: 14,
  },
  originalLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.onSurfaceVariantLight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  originalText: {
    fontSize: 13,
    color: Colors.onSurfaceLight,
    lineHeight: 20,
    fontFamily: 'JetBrainsMono-Regular',
  },
  actionBar: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    backgroundColor: Colors.surfaceLight,
    borderTopWidth: 1,
    borderTopColor: Colors.outlineLight,
  },
  completeButton: { flex: 1 },
  deleteButton: { width: 100 },
  calendarBtn: {
    borderWidth: 1,
    borderColor: Colors.primary500,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  calendarBtnDone: {
    borderColor: Colors.success,
    backgroundColor: Colors.successBg,
  },
  calendarBtnText: {
    fontSize: 14,
    color: Colors.primary500,
    fontWeight: '500',
  },
});
