import { Clock, FileVideo, HardDrive, MonitorPlay, Trash2 } from 'lucide-react';
import { formatDuration, formatFileSize } from '../lib/fileValidation';
import type { VideoMetadata } from '../lib/videoMetadata';

interface VideoPreviewCardProps {
  file: File;
  metadata: VideoMetadata;
  previewUrl: string | null;
  onRemove: () => void;
}

function mimeLabel(file: File): string {
  const type = (file.type || '').split('/')[1];
  if (type) return type.replace('quicktime', 'MOV').toUpperCase();
  const ext = file.name.slice(file.name.lastIndexOf('.') + 1);
  return ext.toUpperCase();
}

export function VideoPreviewCard({ file, metadata, previewUrl, onRemove }: VideoPreviewCardProps) {
  const sizeLabel = formatFileSize(file.size);
  const durationLabel = formatDuration(metadata.duration);
  const resolution = metadata.width && metadata.height ? `${metadata.width} × ${metadata.height}` : '—';

  return (
    <section className="card preview" aria-label="Video preview" data-testid="preview-card">
      <header className="preview__bar">
        <span className="preview__badge">
          <FileVideo size={15} aria-hidden="true" />
          Ready
        </span>
        <p className="preview__name" data-testid="file-name" title={file.name}>
          {file.name}
        </p>
        <button type="button" className="preview__remove" onClick={onRemove} aria-label="Remove video">
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </header>

      <div className="preview__stage">
        {previewUrl ? (
          <video
            className="preview__video"
            data-testid="video-preview"
            src={previewUrl}
            controls
            playsInline
            preload="metadata"
            aria-label={`Preview of ${file.name}`}
          />
        ) : (
          <div className="preview__placeholder" role="status">
            Preparing preview…
          </div>
        )}
      </div>

      <dl className="meta">
        <div className="meta__item">
          <dt>
            <HardDrive size={14} aria-hidden="true" /> Size
          </dt>
          <dd data-testid="file-size">{sizeLabel}</dd>
        </div>
        <div className="meta__item">
          <dt>
            <Clock size={14} aria-hidden="true" /> Duration
          </dt>
          <dd data-testid="file-duration">{durationLabel}</dd>
        </div>
        <div className="meta__item">
          <dt>
            <MonitorPlay size={14} aria-hidden="true" /> Resolution
          </dt>
          <dd data-testid="file-resolution">{resolution}</dd>
        </div>
        <div className="meta__item">
          <dt>
            <FileVideo size={14} aria-hidden="true" /> Format
          </dt>
          <dd data-testid="file-format">{mimeLabel(file)}</dd>
        </div>
      </dl>
    </section>
  );
}
