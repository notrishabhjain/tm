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
const DEPTH = 4;

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

  if (isLoading || !task) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  const priorityColor = getPriorityColor(task.priority);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: priorityColor }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button">
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <PriorityChip priority={task.priority} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* Task title */}
        <Text style={styles.taskTitle} selectable>
          {task.title}
        </Text>

        {/* Source info card */}
        <View style={[styles.neoCardWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
          <View style={[styles.neoCardShadow, { backgroundColor: priorityColor }]} />
          <View style={[styles.neoCard, { borderColor: priorityColor }]}>
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
            <InfoRow label="Confidence" value={`${Math.round(task.confidence * 100)}%`} last />
          </View>
        </View>

        {/* Calendar button */}
        <View style={[styles.neoCardWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
          <View
            style={[
              styles.neoCardShadow,
              { backgroundColor: calendarAdded ? Colors.neoShadowMedium : Colors.neoShadowDefault },
            ]}
          />
          <Pressable
            style={({ pressed }) => [
              styles.calendarBtn,
              {
                borderColor: calendarAdded ? Colors.success : Colors.primary900,
                backgroundColor: calendarAdded ? Colors.successBg : Colors.surfaceLight,
              },
              pressed &&
                !calendarAdded && {
                  transform: [{ translateX: DEPTH }, { translateY: DEPTH }],
                },
            ]}
            onPress={handleAddToCalendar}
            disabled={calendarAdded}
            accessibilityRole="button"
          >
            <Text
              style={[
                styles.calendarBtnText,
                { color: calendarAdded ? Colors.success : Colors.primary900 },
              ]}
            >
              {calendarAdded ? 'Added to Calendar' : 'Add to Calendar'}
            </Text>
          </Pressable>
        </View>

        {/* Original message */}
        {task.body && (
          <>
            <Text style={styles.originalLabel}>ORIGINAL MESSAGE</Text>
            <View style={[styles.neoCardWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
              <View style={[styles.neoCardShadow, { backgroundColor: Colors.neoShadowLow }]} />
              <View style={[styles.neoCard, { borderColor: Colors.lowFg }]}>
                <Text style={styles.originalText} selectable>
                  {task.body}
                </Text>
              </View>
            </View>
          </>
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

function InfoRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}): React.JSX.Element {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundLight },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: Colors.onSurfaceVariantLight, fontSize: 15 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: Colors.primary900,
    borderBottomWidth: 4,
  },
  backBtn: { padding: 4 },
  backText: { fontSize: 15, color: Colors.white, fontWeight: '600' },
  body: { flex: 1 },
  bodyContent: { padding: 16, gap: 12, paddingBottom: 24 },
  taskTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.onSurfaceLight,
    lineHeight: 28,
    marginBottom: 4,
  },
  neoCardWrapper: { position: 'relative' },
  neoCardShadow: {
    position: 'absolute',
    top: DEPTH,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 2,
  },
  neoCard: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 2,
    borderRadius: 2,
    padding: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
  },
  infoRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineLight,
  },
  infoLabel: { fontSize: 13, color: Colors.onSurfaceVariantLight, fontWeight: '600' },
  infoValue: {
    fontSize: 13,
    color: Colors.onSurfaceLight,
    flex: 1,
    textAlign: 'right',
    fontWeight: '500',
  },
  calendarBtn: {
    height: 48,
    borderWidth: 2,
    borderRadius: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarBtnText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  originalLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primary900,
    letterSpacing: 1.2,
    marginBottom: 4,
    textTransform: 'uppercase',
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
    backgroundColor: Colors.primary900,
    borderTopWidth: 2,
    borderTopColor: Colors.black,
  },
  completeButton: { flex: 1 },
  deleteButton: { width: 100 },
});
