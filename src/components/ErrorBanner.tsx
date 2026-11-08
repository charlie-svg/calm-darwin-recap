import { AlertTriangle, X } from 'lucide-react';

interface ErrorBannerProps {
  title?: string;
  message: string;
  onDismiss?: () => void;
}

export function ErrorBanner({ title = 'Upload rejected', message, onDismiss }: ErrorBannerProps) {
  return (
    <div className="error" role="alert" aria-live="assertive" data-testid="error-message">
      <span className="error__icon" aria-hidden="true">
        <AlertTriangle size={18} />
      </span>
      <div className="error__body">
        <p className="error__title">{title}</p>
        <p className="error__text" data-testid="error-text">
          {message}
        </p>
      </div>
      {onDismiss ? (
        <button type="button" className="error__close" onClick={onDismiss} aria-label="Dismiss error">
          <X size={16} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
