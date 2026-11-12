import { Alert, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { MAX_INCIDENT_PHOTOS } from '@eventra/shared';
import { notifyError } from './lib/toast';
import { toPickedPhoto, type PhotoRejection, type PickedPhoto } from './lib/photos';
import { Button, Muted } from './ui';
import { colors, radius, spacing } from './theme';

const REJECTION: Record<PhotoRejection, string> = {
  TYPE: 'Foto harus berformat JPEG atau PNG.',
  SIZE: 'Foto terlalu besar (maksimal 3 MB). Coba ambil ulang.',
  EMPTY: 'Foto tidak dapat dibaca. Coba ambil ulang.',
};

interface Props {
  photos: PickedPhoto[];
  onChange: (photos: PickedPhoto[]) => void;
  max?: number;
}

const OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  // Kualitas 0.6 menjaga foto ponsel modern di bawah batas 3 MB backend.
  quality: 0.6,
  base64: true,
  exif: false,
};

/** Ambil foto dari kamera/galeri sebagai byte siap unggah (JPEG/PNG, ≤ 3 MB, dicek sebelum dikirim). */
export function PhotoPicker({ photos, onChange, max = MAX_INCIDENT_PHOTOS }: Props) {
  const full = photos.length >= max;

  const accept = (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled) return;
    const next = [...photos];
    for (const asset of result.assets) {
      if (next.length >= max) break;
      const picked = toPickedPhoto(asset);
      if ('error' in picked) notifyError(REJECTION[picked.error]);
      else next.push(picked.photo);
    }
    onChange(next);
  };

  const camera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Izin kamera', 'Aktifkan izin kamera di pengaturan perangkat untuk memotret.');
      return;
    }
    accept(await ImagePicker.launchCameraAsync(OPTIONS));
  };

  const library = async () =>
    accept(
      await ImagePicker.launchImageLibraryAsync({
        ...OPTIONS,
        allowsMultipleSelection: true,
        selectionLimit: max - photos.length,
      }),
    );

  return (
    <View style={styles.wrap}>
      <Muted>
        {photos.length}/{max} foto
      </Muted>
      <View style={styles.grid}>
        {photos.map((p, i) => (
          <View key={`${p.uri}-${i}`} style={styles.thumbWrap}>
            <Image source={{ uri: p.uri }} style={styles.thumb} contentFit="cover" />
            <View style={styles.remove}>
              <Button
                variant="error"
                offlineOk
                onPress={() => onChange(photos.filter((_, j) => j !== i))}
              >
                Hapus
              </Button>
            </View>
          </View>
        ))}
      </View>
      <View style={styles.actions}>
        <View style={styles.action}>
          <Button offlineOk disabled={full} onPress={camera}>
            Foto
          </Button>
        </View>
        <View style={styles.action}>
          <Button offlineOk variant="outline" disabled={full} onPress={library}>
            Galeri
          </Button>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumbWrap: { width: '47%', gap: spacing.xs },
  thumb: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.field,
    backgroundColor: colors.base300,
  },
  remove: { alignSelf: 'stretch' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
});
