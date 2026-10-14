import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PrimaryActionPanel } from '../../frontend/src/app/contexts/trade-room/PrimaryActionPanel';

afterEach(() => cleanup());

describe('PrimaryActionPanel: uzlaşma yönlendirmesi', () => {
  it('settlement_guidance birincil aksiyonu artık "aşağıdaki karta bakın" kutusu çizmez', () => {
    const action = { type: 'settlement', key: 'settlement_guidance', label: 'Uzlaşma teklifi', description: 'Aşağıdaki uzlaşma kartından teklif verin veya yanıtlayın.' };
    const { container } = render(<PrimaryActionPanel primaryAction={action} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/Aşağıdaki uzlaşma kartından/)).not.toBeInTheDocument();
  });

  it('diğer bilgi aksiyonları değişmeden gösterilir', () => {
    const action = { type: 'info', key: 'waiting', label: 'Bekleniyor', description: 'Karşı taraf yanıtlıyor.' };
    render(<PrimaryActionPanel primaryAction={action} />);
    expect(screen.getByText('Bekleniyor')).toBeInTheDocument();
  });
});
