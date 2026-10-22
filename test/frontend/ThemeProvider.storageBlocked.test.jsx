import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ThemeProvider } from '../../frontend/src/app/providers/ThemeProvider';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('P10 ThemeProvider depolama engelli (F1-09)', () => {
  it('localStorage get/set fırlatırken render edilir', () => {
    const boom = () => { throw new DOMException('blocked', 'SecurityError'); };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom);
    render(<ThemeProvider><p>icerik</p></ThemeProvider>);
    expect(screen.getByText('icerik')).toBeInTheDocument();
  });
});
