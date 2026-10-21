import { useMemo } from 'react';
import { useOwnerWalletAge } from '../../../hooks/useOwnerWalletAge';

// [TR] Hook'u buildAppViews (düz fonksiyon) dışında çalıştırmak için ince sarmalayıcı. Yalnız BUY_CRYPTO emirlerinin
//      sahiplerini (benzersiz) okur. children(ownerAgeRemainingSec(order) -> saniye | null).
// [EN] Thin wrapper so the hook can run outside the plain buildAppViews function. Reads unique owners of BUY orders only.
export default function OwnerAgeScope({ orders, getWalletRegisteredAt, chainOffsetMs = 0, children }) {
  const owners = useMemo(
    () => (orders || []).filter((o) => o?.side === 'BUY_CRYPTO').map((o) => o.makerFull),
    [orders],
  );
  const { remainingSecFor } = useOwnerWalletAge({ owners, getWalletRegisteredAt, chainOffsetMs });
  return children((order) => (order?.side === 'BUY_CRYPTO' ? remainingSecFor(order.makerFull) : null));
}
