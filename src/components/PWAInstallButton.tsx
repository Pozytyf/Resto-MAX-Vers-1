import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({
  compact = false,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        data-testid="pwa-install-btn"
        className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg bg-[#14B8A6] text-white text-xs font-semibold hover:bg-[#0D9488] transition-colors cursor-pointer whitespace-nowrap shrink-0"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span className={compact ? 'hidden sm:inline' : ''}>
          Installer l’app POS
        </span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          data-testid="pwa-ios-install-btn"
          className="inline-flex items-center gap-1.5 min-h-[36px] px-2.5 rounded-lg border border-[var(--rm-border)] bg-[var(--rm-surface-muted)] text-xs font-semibold text-[var(--rm-ink)] hover:bg-[var(--rm-surface-hover)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Smartphone className="w-3.5 h-3.5 text-[#FF8738] shrink-0" />
          <span className="hidden sm:inline">Installer iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-xl bg-[var(--rm-surface)] border border-[var(--rm-border)] p-5 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-[var(--rm-ink)]">
                  Installer Resto’MAX sur iPhone / iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-lg hover:bg-[var(--rm-surface-hover)] text-[var(--rm-ink-muted)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="text-sm text-[var(--rm-ink-muted)] space-y-2 list-decimal pl-4">
                <li>
                  Touchez le bouton <strong className="text-[var(--rm-ink)]">Partager</strong> dans la barre Safari.
                </li>
                <li>
                  Faites défiler et sélectionnez{' '}
                  <strong className="text-[var(--rm-ink)]">Sur l’écran d’accueil</strong>.
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2 rounded-lg bg-[#FF8738] text-white text-xs font-semibold cursor-pointer"
              >
                Compris
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
