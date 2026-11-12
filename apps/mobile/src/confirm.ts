import { Alert } from 'react-native';

/** Dialog konfirmasi native; resolve true bila pengguna memilih lanjut. */
export const confirm = (title: string, message: string, okLabel = 'Lanjut'): Promise<boolean> =>
  new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Batal', style: 'cancel', onPress: () => resolve(false) },
        { text: okLabel, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
