import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/ui/theme/colors';
import { Button } from '@/ui/components/Button';
import * as FileSystem from 'expo-file-system';
import {
  isModelCached,
  downloadModel,
  deleteModel,
  getModelLocalPath,
} from '@/services/model-manager';
import { loadModel, isModelLoaded, resetModelLoadState } from '@/services/onnx-classifier';
import {
  isLlmCached,
  downloadLlm,
  deleteLlm,
  getLlmSizeBytes,
  isSmallLlmCached,
  downloadSmallLlm,
  deleteSmallLlm,
  getSmallLlmSizeBytes,
} from '@/services/llm-manager';
import {
  loadLlm,
  isLlmLoaded,
  unloadLlm,
  getLlmLoadError,
  loadSmallLlm,
  isSmallLlmLoaded,
  unloadSmallLlm,
  getSmallLlmLoadError,
} from '@/services/llm-service';

type ModelStatus = 'checking' | 'not-downloaded' | 'downloading' | 'loading' | 'ready' | 'error';

// ── MiniLM card ───────────────────────────────────────────────────────────────

function MiniLmCard(): React.JSX.Element {
  const [status, setStatus] = useState<ModelStatus>('checking');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [sizeKb, setSizeKb] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setStatus('checking');
    const cached = await isModelCached();
    if (!cached) {
      setStatus('not-downloaded');
      return;
    }
    try {
      const info = await FileSystem.getInfoAsync(getModelLocalPath());
      if (info.exists && 'size' in info) setSizeKb(Math.round((info.size as number) / 1024));
    } catch {
      /* non-fatal */
    }
    if (isModelLoaded()) {
      setStatus('ready');
      return;
    }
    setStatus('loading');
    const ok = await loadModel();
    setStatus(ok ? 'ready' : 'error');
    if (!ok)
      setErrorMsg('Model file downloaded but failed to load. Try deleting and re-downloading.');
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleDownload = async (): Promise<void> => {
    setStatus('downloading');
    setProgress(0);
    setErrorMsg('');
    resetModelLoadState();
    try {
      await downloadModel((p) => setProgress(p));
      setStatus('loading');
      const ok = await loadModel();
      if (ok) {
        setStatus('ready');
        try {
          const info = await FileSystem.getInfoAsync(getModelLocalPath());
          if (info.exists && 'size' in info) setSizeKb(Math.round((info.size as number) / 1024));
        } catch {
          /* non-fatal */
        }
      } else {
        setStatus('error');
        setErrorMsg('Download succeeded but model failed to initialise.');
      }
    } catch (err) {
      setStatus('error');
      setErrorMsg(String(err));
    }
  };

  const handleDelete = (): void => {
    Alert.alert(
      'Delete classifier model?',
      'The model file (~22 MB) will be removed. Extraction falls back to keyword rules only.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteModel().then(() => {
              setSizeKb(null);
              setStatus('not-downloaded');
            });
          },
        },
      ]
    );
  };

  return (
    <ModelCard
      name="all-MiniLM-L6-v2 (quantized)"
      badge="Classifier · ~22 MB"
      description="Sentence-embedding classifier for notification scoring. Runs at <500 ms per inference. Download optional — keyword rules cover most cases without it."
      status={status}
      progress={progress}
      errorMsg={errorMsg}
      sizeLabel={
        sizeKb !== null && status === 'ready'
          ? `${Math.round(sizeKb / 1024)} MB on device`
          : undefined
      }
      onDownload={() => void handleDownload()}
      onDelete={handleDelete}
      downloadLabel="Download (~22 MB)"
    />
  );
}

// ── Qwen3-0.6B card (notification classifier) ─────────────────────────────────

function SmallLlmCard(): React.JSX.Element {
  const [status, setStatus] = useState<ModelStatus>('checking');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [sizeMb, setSizeMb] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setStatus('checking');
    const cached = await isSmallLlmCached();
    if (!cached) {
      setStatus('not-downloaded');
      return;
    }
    try {
      const bytes = await getSmallLlmSizeBytes();
      if (bytes > 0) setSizeMb(Math.round(bytes / (1024 * 1024)));
    } catch {
      /* non-fatal */
    }
    if (isSmallLlmLoaded()) {
      setStatus('ready');
      return;
    }
    setStatus('loading');
    const ok = await loadSmallLlm();
    setStatus(ok ? 'ready' : 'error');
    if (!ok) {
      const detail = getSmallLlmLoadError();
      setErrorMsg(
        detail
          ? `Failed to load: ${detail}`
          : 'Model files present but failed to load. Try deleting and re-downloading.'
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleDownload = async (): Promise<void> => {
    setStatus('downloading');
    setProgress(0);
    setErrorMsg('');
    try {
      await downloadSmallLlm((p) => setProgress(p));
      setStatus('loading');
      const ok = await loadSmallLlm();
      if (ok) {
        setStatus('ready');
        try {
          const bytes = await getSmallLlmSizeBytes();
          if (bytes > 0) setSizeMb(Math.round(bytes / (1024 * 1024)));
        } catch {
          /* non-fatal */
        }
      } else {
        setStatus('error');
        const detail = getSmallLlmLoadError();
        setErrorMsg(
          detail
            ? `Downloaded OK but failed to load: ${detail}`
            : 'Download succeeded but model failed to load. Delete and re-download if this persists.'
        );
      }
    } catch (err) {
      setStatus('error');
      setErrorMsg(String(err));
    }
  };

  const handleDelete = (): void => {
    Alert.alert(
      'Delete notification classifier?',
      'The Qwen3-0.6B model (~380 MB) will be removed. Notification classification falls back to keyword rules.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void unloadSmallLlm()
              .then(() => deleteSmallLlm())
              .then(() => {
                setSizeMb(null);
                setStatus('not-downloaded');
              });
          },
        },
      ]
    );
  };

  return (
    <ModelCard
      name="Qwen3-0.6B Q4_K_M (classifier)"
      badge="LLM · ~380 MB download"
      description="Fast on-device LLM for notification classification. Understands context, negation, and intent — not just keywords. Learns from your confirm/reject history via few-shot examples. Stays loaded for background use."
      status={status}
      progress={progress}
      errorMsg={errorMsg}
      sizeLabel={sizeMb !== null && status === 'ready' ? `${sizeMb} MB on device` : undefined}
      onDownload={() => void handleDownload()}
      onDelete={handleDelete}
      downloadLabel="Download (~380 MB)"
    />
  );
}

// ── Qwen3-1.7B card (screenshot / transcript extractor) ──────────────────────

function Qwen3Card(): React.JSX.Element {
  const [status, setStatus] = useState<ModelStatus>('checking');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [sizeMb, setSizeMb] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setStatus('checking');
    const cached = await isLlmCached();
    if (!cached) {
      setStatus('not-downloaded');
      return;
    }
    try {
      const bytes = await getLlmSizeBytes();
      if (bytes > 0) setSizeMb(Math.round(bytes / (1024 * 1024)));
    } catch {
      /* non-fatal */
    }
    if (isLlmLoaded()) {
      setStatus('ready');
      return;
    }
    setStatus('loading');
    const ok = await loadLlm();
    setStatus(ok ? 'ready' : 'error');
    if (!ok) {
      const detail = getLlmLoadError();
      setErrorMsg(
        detail
          ? `Failed to load: ${detail}`
          : 'Model files present but failed to load. Try deleting and re-downloading.'
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleDownload = async (): Promise<void> => {
    setStatus('downloading');
    setProgress(0);
    setErrorMsg('');
    try {
      await downloadLlm((p) => setProgress(p));
      setStatus('loading');
      const ok = await loadLlm();
      if (ok) {
        setStatus('ready');
        try {
          const bytes = await getLlmSizeBytes();
          if (bytes > 0) setSizeMb(Math.round(bytes / (1024 * 1024)));
        } catch {
          /* non-fatal */
        }
      } else {
        setStatus('error');
        const detail = getLlmLoadError();
        setErrorMsg(
          detail
            ? `Downloaded OK but failed to load: ${detail}`
            : 'Download succeeded but model failed to load. Delete and re-download if this persists.'
        );
      }
    } catch (err) {
      setStatus('error');
      setErrorMsg(String(err));
    }
  };

  const handleDelete = (): void => {
    Alert.alert(
      'Delete Qwen3-1.7B?',
      'The model file (~1.1 GB) will be removed. Screenshot and transcript analysis will fall back to keyword rules.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void unloadLlm()
              .then(() => deleteLlm())
              .then(() => {
                setSizeMb(null);
                setStatus('not-downloaded');
              });
          },
        },
      ]
    );
  };

  return (
    <ModelCard
      name="Qwen3-1.7B Q4_K_M (extractor)"
      badge="LLM · ~1.1 GB download"
      description="Larger model for rich task extraction from screenshots and meeting transcripts. Loaded on-demand when needed. Requires ~1.2 GB free RAM."
      status={status}
      progress={progress}
      errorMsg={errorMsg}
      sizeLabel={sizeMb !== null && status === 'ready' ? `${sizeMb} MB on device` : undefined}
      onDownload={() => void handleDownload()}
      onDelete={handleDelete}
      downloadLabel="Download (~1.1 GB)"
    />
  );
}

// ── Shared card component ─────────────────────────────────────────────────────

interface ModelCardProps {
  name: string;
  badge: string;
  description: string;
  status: ModelStatus;
  progress: number;
  errorMsg: string;
  sizeLabel?: string;
  onDownload: () => void;
  onDelete: () => void;
  downloadLabel: string;
}

function ModelCard({
  name,
  badge,
  description,
  status,
  progress,
  errorMsg,
  sizeLabel,
  onDownload,
  onDelete,
  downloadLabel,
}: ModelCardProps): React.JSX.Element {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.modelName}>{name}</Text>
        <View style={styles.badgePill}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      </View>
      <Text style={styles.modelDesc}>{description}</Text>

      <View style={styles.statusRow}>
        <StatusIndicator status={status} />
        {sizeLabel && <Text style={styles.sizeBadge}>{sizeLabel}</Text>}
      </View>

      {status === 'downloading' && (
        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          <Text style={styles.progressText}>{Math.round(progress * 100)}%</Text>
        </View>
      )}
      {status === 'error' && (
        <Text style={styles.errorText}>{errorMsg || 'An error occurred.'}</Text>
      )}

      <View style={styles.actionArea}>
        {(status === 'not-downloaded' || status === 'error') && (
          <Button label={downloadLabel} variant="primary" onPress={onDownload} />
        )}
        {status === 'downloading' && (
          <View style={styles.centerRow}>
            <ActivityIndicator color={Colors.primary500} />
            <Text style={styles.downloadingText}>Downloading… {Math.round(progress * 100)}%</Text>
          </View>
        )}
        {status === 'loading' && (
          <View style={styles.centerRow}>
            <ActivityIndicator color={Colors.primary500} />
            <Text style={styles.downloadingText}>Loading model into memory…</Text>
          </View>
        )}
        {status === 'ready' && (
          <Button label="Delete Model" variant="destructive" onPress={onDelete} />
        )}
      </View>
    </View>
  );
}

// ── Root screen ───────────────────────────────────────────────────────────────

export default function AIModelScreen(): React.JSX.Element {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹ Settings</Text>
        </Pressable>
        <Text style={styles.title}>AI Models</Text>
        <View style={{ width: 70 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>NOTIFICATION CLASSIFIER</Text>
        <MiniLmCard />

        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>ON-DEVICE LLM · CLASSIFIER</Text>
        <SmallLlmCard />

        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>ON-DEVICE LLM · EXTRACTOR</Text>
        <Qwen3Card />

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>How models are used</Text>
          <InfoRow text="0.6B Classifier: primary notification intelligence — understands context, learns from your history" />
          <InfoRow text="1.7B Extractor: richer title extraction from screenshots & transcripts (on-demand)" />
          <InfoRow text="MiniLM: blends with keyword rules when 0.6B classifier is not loaded" />
          <InfoRow text="Without any LLM: keyword + sentence structure rules still work as fallback" />
          <InfoRow text="All inference runs 100% on-device — no data ever leaves your phone" />
          <InfoRow text="Only one LLM can be loaded at a time (RAM constraint)" />
        </View>
      </ScrollView>
    </View>
  );
}

function StatusIndicator({ status }: { status: ModelStatus }): React.JSX.Element {
  const configs: Record<ModelStatus, { color: string; label: string }> = {
    checking: { color: Colors.onSurfaceVariantLight, label: 'Checking…' },
    'not-downloaded': { color: Colors.onSurfaceVariantLight, label: 'Not downloaded' },
    downloading: { color: Colors.warning, label: 'Downloading' },
    loading: { color: Colors.warning, label: 'Loading' },
    ready: { color: Colors.success, label: 'Ready' },
    error: { color: Colors.error, label: 'Error' },
  };
  const cfg = configs[status];
  return (
    <View style={styles.statusPill}>
      <View style={[styles.statusDot, { backgroundColor: cfg.color }]} />
      <Text style={[styles.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

function InfoRow({ text }: { text: string }): React.JSX.Element {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoIcon}>▪</Text>
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundLight },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: Colors.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineLight,
  },
  backButton: { padding: 4 },
  backText: { fontSize: 16, color: Colors.primary500, fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '700', color: Colors.onSurfaceLight },
  content: { padding: 16, gap: 8, paddingBottom: 32 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.onSurfaceVariantLight,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  card: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    padding: 16,
    elevation: 1,
    gap: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  modelName: { fontSize: 15, fontWeight: '700', color: Colors.onSurfaceLight, flex: 1 },
  badgePill: {
    backgroundColor: Colors.surfaceVariantLight,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 11, color: Colors.onSurfaceVariantLight, fontWeight: '500' },
  modelDesc: { fontSize: 13, color: Colors.onSurfaceVariantLight, lineHeight: 20 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 13, fontWeight: '600' },
  sizeBadge: { fontSize: 12, color: Colors.onSurfaceVariantLight },
  progressContainer: { gap: 6 },
  progressTrack: {
    height: 6,
    backgroundColor: Colors.outlineLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: Colors.primary500, borderRadius: 3 },
  progressText: { fontSize: 12, color: Colors.onSurfaceVariantLight, textAlign: 'right' },
  errorText: { fontSize: 12, color: Colors.error, lineHeight: 18 },
  actionArea: { marginTop: 4 },
  centerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center' },
  downloadingText: { fontSize: 14, color: Colors.onSurfaceVariantLight },
  infoCard: {
    backgroundColor: Colors.surfaceVariantLight,
    borderRadius: 10,
    padding: 14,
    gap: 8,
    marginTop: 12,
  },
  infoTitle: { fontSize: 13, fontWeight: '600', color: Colors.onSurfaceLight, marginBottom: 2 },
  infoRow: { flexDirection: 'row', gap: 8 },
  infoIcon: { fontSize: 12, color: Colors.primary500, marginTop: 2 },
  infoText: { fontSize: 12, color: Colors.onSurfaceVariantLight, flex: 1, lineHeight: 18 },
});
