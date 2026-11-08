import { useEffect, useState } from 'react';

interface UrlState {
  blob: Blob;
  url: string;
}

/**
 * Creates a blob: URL for a File/Blob and guarantees revokeObjectURL on cleanup.
 * The URL is stored together with its source object and only returned when the
 * source still matches, preventing stale player URLs during source swaps.
 */
export function useObjectUrl(blob: Blob | null): string | null {
  const [state, setState] = useState<UrlState | null>(null);

  useEffect(() => {
    if (!blob) {
      setState(null);
      return;
    }

    const url = URL.createObjectURL(blob);
    setState({ blob, url });

    return () => {
      URL.revokeObjectURL(url);
      setState((current) => (current && current.url === url ? null : current));
    };
  }, [blob]);

  return state && state.blob === blob ? state.url : null;
}
