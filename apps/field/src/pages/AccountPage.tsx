import type { UserDto } from '@eventra/shared';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { Card, Row, Screen } from '@/components/ui';

const ROLE_LABEL: Record<UserDto['role'], string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  OPS_COORDINATOR: 'Koordinator operasional',
  WAREHOUSE: 'Gudang',
  FIELD_PIC: 'PIC lapangan',
  CUSTOMER: 'Pelanggan',
};

export function AccountPage() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <Screen title="Akun">
      <Card>
        <Row label="Nama" value={user.name} />
        <Row label="Email" value={user.email} />
        <Row label="Peran" value={ROLE_LABEL[user.role]} />
      </Card>
      <Button variant="ghost" className="ev-btn--block" onClick={logout}>
        Keluar
      </Button>
    </Screen>
  );
}
