import { logout } from '@eventra/api-client';
import type { UserDto } from '@eventra/shared';
import { api, sessionStore } from '../api';
import { Button, Card, Row, Screen } from '../ui';

const ROLE_LABEL: Record<UserDto['role'], string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  OPS_COORDINATOR: 'Koordinator operasional',
  WAREHOUSE: 'Gudang',
  FIELD_PIC: 'PIC lapangan',
  CUSTOMER: 'Pelanggan',
};

export function AccountScreen({ user }: { user: UserDto }) {
  const signOut = async () => {
    const { refreshToken } = sessionStore.get();
    // Cabut refresh token di server; bila offline sesi lokal tetap dihapus.
    if (refreshToken) await logout(api, refreshToken).catch(() => undefined);
    await sessionStore.clear();
  };

  return (
    <Screen title="Akun">
      <Card>
        <Row label="Nama" value={user.name} />
        <Row label="Email" value={user.email} />
        <Row label="Peran" value={ROLE_LABEL[user.role]} />
      </Card>
      <Button variant="outline" offlineOk onPress={signOut}>
        Keluar
      </Button>
    </Screen>
  );
}
