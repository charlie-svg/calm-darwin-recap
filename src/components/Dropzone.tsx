import { useCallback, useRef, useState } from 'react';
import { Film, Loader2, UploadCloud } from 'lucide-react';
import { ACCEPTED_EXTENSIONS, MAX_FILE_SIZE_LABEL } from '../lib/fileValidation';

interface DropzoneProps {
  onFileSelected: (file: File) => void;
  isLoading: boolean;
  disabled?: boolean;
  /** Shown under the headline once a file exists, so the panel stays useful. */
  compact?: boolean;
}

export function Dropzone({ onFileSelected, isLoading, disabled = false, compact = false }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);

  const openPicker = useCallback(() => {
    if (disabled || isLoading) return;
    inputRef.current?.click();
  }, [disabled, isLoading]);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragDepth.current = 0;
      setIsDragging(false);
      if (disabled || isLoading) return;
      const dropped = event.dataTransfer?.files?.[0];
      if (dropped) onFileSelected(dropped);
    },
    [disabled, isLoading, onFileSelected],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        openPicker();
      }
    },
    [openPicker],
  );

  return (
    <div
      className={`dropzone${isDragging ? ' dropzone--active' : ''}${compact ? ' dropzone--compact' : ''}`}
      data-testid="dropzone"
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Upload a video file"
      aria-disabled={disabled}
      onClick={openPicker}
      onKeyDown={handleKeyDown}
      onDragEnter={(event) => {
        event.preventDefault();
        dragDepth.current += 1;
        if (!disabled && !isLoading) setIsDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setIsDragging(false);
      }}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        className="dropzone__input"
        data-testid="file-input"
        type="file"
        accept=".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime"
        onChange={(event) => {
          const picked = event.target.files?.[0];
          if (picked) onFileSelected(picked);
          // Reset so re-picking the same file fires a change event again.
          event.target.value = '';
        }}
        tabIndex={-1}
      />

      <span className={`dropzone__icon${isLoading ? ' dropzone__icon--busy' : ''}`} aria-hidden="true">
        {isLoading ? <Loader2 size={26} className="spin" /> : isDragging ? <Film size={26} /> : <UploadCloud size={26} />}
      </span>

      <div className="dropzone__copy">
        <p className="dropzone__title">
        {isLoading ? 'Reading video metadata…' : isDragging ? 'Drop it — server processing starts after you confirm' : 'Drag & drop your movie here'}
        </p>
        <p className="dropzone__hint">
          or <span className="dropzone__link">browse files</span> · MP4, WebM, MOV · max {MAX_FILE_SIZE_LABEL}
        </p>
      </div>

      <p className="dropzone__privacy">
        <span className="dot" aria-hidden="true" />
        Temporary server processing — download the result, then files are deleted
      </p>

      <span className="sr-only">Accepted extensions: {ACCEPTED_EXTENSIONS.join(', ')}</span>
    </div>
  );
}
