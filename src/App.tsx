import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clapperboard, Film, LoaderCircle, Server, ShieldCheck, Sparkles, Subtitles, Wand2, XCircle } from 'lucide-react';
import { Dropzone } from './components/Dropzone';
import { ErrorBanner } from './components/ErrorBanner';
import { VideoPreviewCard } from './components/VideoPreviewCard';
import { useObjectUrl } from './hooks/useObjectUrl';
import { validateFileDetailed } from './lib/fileValidation';
import { readVideoMetadata, type VideoMetadata } from './lib/videoMetadata';

type UploadState =
  | { status: 'idle' }
  | { status: 'validating'; fileName: string }
  | { status: 'ready'; file: File; metadata: VideoMetadata }
  | { status: 'error'; message: string; title: string };
type ProcessState = 'idle' | 'processing' | 'done' | 'error';

const PIPELINE = [
  { label: 'Upload', icon: Clapperboard },
  { label: 'Server audio', icon: Server },
  { label: 'Transcribe', icon: Wand2 },
  { label: 'Myanmar captions', icon: Subtitles },
  { label: 'Download MP4', icon: Film },
];

const STAGES = [
  'Uploading the source video securely…',
  'Extracting speech audio with server FFmpeg…',
  'Transcribing timestamps with Manus Speech…',
  'Translating captions and burning libass subtitles…',
];

export default function App() {
  const [state, setState] = useState<UploadState>({ status: 'idle' });
  const [processState, setProcessState] = useState<ProcessState>('idle');
  const [processStage, setProcessStage] = useState(0);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultName, setResultName] = useState('recap-myanmar.mp4');
  const requestId = useRef(0);
  const mounted = useRef(true);
  const activeFile = state.status === 'ready' ? state.file : null;
  const previewUrl = useObjectUrl(activeFile);
  const resultUrl = useObjectUrl(resultBlob);

  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    const prevent = (event: DragEvent) => event.preventDefault();
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => { window.removeEventListener('dragover', prevent); window.removeEventListener('drop', prevent); };
  }, []);

  const handleFileSelected = useCallback(async (file: File) => {
    const ticket = ++requestId.current;
    setProcessState('idle');
    setProcessStage(0);
    setResultBlob(null);
    const verdict = validateFileDetailed(file);
    if (!verdict.ok) {
      setState({ status: 'error', title: 'Upload rejected', message: verdict.message ?? 'This file cannot be used.' });
      return;
    }
    setState({ status: 'validating', fileName: file.name });
    try {
      const metadata = await readVideoMetadata(file);
      if (ticket !== requestId.current || !mounted.current) return;
      setState({ status: 'ready', file, metadata });
    } catch (error) {
      if (ticket !== requestId.current || !mounted.current) return;
      setState({ status: 'error', title: 'Could not read video', message: error instanceof Error ? error.message : 'Could not read this video.' });
    }
  }, []);

  const reset = useCallback(() => {
    requestId.current += 1;
    setState({ status: 'idle' });
    setProcessState('idle');
    setProcessStage(0);
    setResultBlob(null);
  }, []);

  const processVideo = useCallback(async () => {
    if (state.status !== 'ready') return;
    setProcessState('processing');
    setProcessStage(0);
    setResultBlob(null);
    try {
      const form = new FormData();
      form.append('video', state.file, state.file.name);
      setProcessStage(1);
      const response = await fetch('/api/process-video', { method: 'POST', body: form });
      if (!response.ok) {
        let message = `Server processing failed (HTTP ${response.status}).`;
        try { const body = await response.json() as { error?: string }; if (body.error) message = body.error; } catch { /* keep status message */ }
        throw new Error(message);
      }
      setProcessStage(3);
      const blob = await response.blob();
      if (!blob.size) throw new Error('The server returned an empty MP4.');
      setResultName(response.headers.get('content-disposition')?.match(/filename="?([^";]+)"?/i)?.[1] ?? `${state.file.name.replace(/\.[^.]+$/u, '')}-myanmar.mp4`);
      setResultBlob(blob);
      setProcessState('done');
      setProcessStage(4);
    } catch (error) {
      setProcessState('error');
      setState((current) => current.status === 'ready' ? current : ({ status: 'error', title: 'Server processing failed', message: error instanceof Error ? error.message : 'Could not process this video.' }));
    }
  }, [state]);

  const currentStep = processState === 'done' ? 5 : processState === 'processing' ? Math.min(4, processStage + 1) : 1;
  const isReady = state.status === 'ready';
  const isBusy = state.status === 'validating' || processState === 'processing';

  return (
    <div className="app">
      <div className="aurora" aria-hidden="true" />
      <header className="topbar">
        <div className="brand"><span className="brand__mark" aria-hidden="true"><Clapperboard size={20} /></span><div className="brand__text"><p className="brand__title">Recap Studio</p><p className="brand__sub">Myanmar Subtitle Engine</p></div></div>
        <span className="pill"><Sparkles size={13} aria-hidden="true" /> Step {currentStep} of 5</span>
      </header>
      <main className="main">
        <section className="hero"><p className="hero__eyebrow">AI Movie Recap</p><h1 className="hero__title">Turn a full movie into a<span className="hero__gradient"> Myanmar-subtitled recap</span></h1><p className="hero__lede">Upload once; our server handles FFmpeg audio extraction, transcription, Myanmar translation, and libass rendering so your phone stays cool.</p></section>
        <nav className="rail" aria-label="Workflow progress" data-testid="workflow-rail">
          {PIPELINE.map((item, index) => { const Icon = item.icon; const status = index < currentStep - 1 ? 'done' : index === currentStep - 1 ? 'current' : 'locked'; return <div key={item.label} className={`rail__step rail__step--${status}`} aria-current={status === 'current' ? 'step' : undefined} aria-label={`Step ${index + 1}: ${item.label}`}><span className="rail__index" aria-hidden="true">{status === 'current' ? <Icon size={14} /> : status === 'done' ? <CheckCircle2 size={14} /> : index + 1}</span><span className="rail__label">{item.label}</span></div>; })}
        </nav>
        <section className="panel" aria-label="Server video processing" data-testid="server-processing-panel">
          <div className="panel__head"><div><h2 className="panel__title">{processState === 'done' ? 'Your recap is ready' : 'Source video'}</h2><p className="step2__lede">{processState === 'done' ? 'The MP4 was rendered on the server with Noto Serif Myanmar and libass.' : 'Your browser uploads the source once; it does not load FFmpeg or render the video.'}</p></div><span className="panel__meta"><ShieldCheck size={14} aria-hidden="true" /> server pipeline</span></div>
          {state.status === 'error' ? <ErrorBanner title={state.title} message={state.message} onDismiss={reset} /> : null}
          {isReady ? <VideoPreviewCard file={state.file} metadata={state.metadata} previewUrl={previewUrl} onRemove={reset} /> : null}
          {processState === 'processing' ? <div className="extract-status" data-testid="processing-status" aria-live="polite"><span className="extract-status__icon extract-status__icon--busy" aria-hidden="true"><LoaderCircle size={19} className="spin" /></span><div className="extract-status__copy"><strong>{STAGES[Math.min(processStage, STAGES.length - 1)]}</strong><span>Keep this tab open while the server processes the video.</span></div><span className="extract-status__percent">{Math.round(((processStage + 1) / 4) * 100)}%</span></div> : null}
          {processState === 'error' ? <div className="error step2__error" role="alert" data-testid="process-error"><span className="error__icon" aria-hidden="true"><XCircle size={18} /></span><div className="error__body"><p className="error__title">Server processing failed</p><p className="error__text">Try the same video again after checking the server status.</p></div></div> : null}
          {processState === 'done' && resultUrl ? <section className="audio-result" data-testid="server-result"><div className="audio-result__head"><span className="audio-result__icon" aria-hidden="true"><CheckCircle2 size={16} /></span><div className="audio-result__name"><strong>{resultName}</strong><span>Server-rendered MP4 · {resultBlob ? `${(resultBlob.size / 1024 / 1024).toFixed(1)} MB` : ''}</span></div><a className="download-button" href={resultUrl} download={resultName} data-testid="download-result">Download MP4</a></div><video className="audio-result__player" controls preload="metadata" src={resultUrl} data-testid="result-preview" aria-label="Server-rendered Myanmar recap" /></section> : null}
          <div className="step2__actions"><button type="button" className="secondary-button" onClick={reset} disabled={isBusy}>Choose another video</button>{isReady && processState !== 'done' ? <button type="button" className="cta" onClick={processVideo} disabled={isBusy} data-testid="process-video">Upload and render on server <Server size={17} aria-hidden="true" /></button> : null}{processState === 'done' && resultUrl ? <a className="cta" href={resultUrl} download={resultName} data-testid="download-result-cta">Download final MP4 <Film size={17} aria-hidden="true" /></a> : null}</div>
          {!isReady && processState === 'idle' ? <Dropzone onFileSelected={handleFileSelected} isLoading={state.status === 'validating'} disabled={state.status === 'validating'} /> : null}
          {isReady && processState === 'idle' ? <Dropzone onFileSelected={handleFileSelected} isLoading={false} disabled={false} compact /> : null}
          <p className="step2__privacy">The source video is sent only to this project’s temporary processing container. Audio, SRT, and intermediate files are deleted after the MP4 download is complete.</p>
        </section>
        {currentStep === 1 ? <section className="next" aria-label="What happens next"><article className="next__card"><span className="next__icon" aria-hidden="true"><Server size={18} /></span><h3>Server-side processing</h3><p>FFmpeg extracts audio and renders captions on the server; mobile browsers do no heavy media work.</p></article><article className="next__card"><span className="next__icon" aria-hidden="true"><Subtitles size={18} /></span><h3>Readable Myanmar</h3><p>libass shapes Noto Serif Myanmar with a high-contrast backing and safe wrapping.</p></article></section> : null}
      </main>
      <footer className="footer"><span>{processState === 'done' ? 'Complete · download final MP4' : processState === 'processing' ? 'Server processing · keep this tab open' : 'Ready for a server-rendered recap'}</span><span aria-hidden="true">•</span><span>Temporary server processing · cleanup enabled · telemetry disabled</span></footer>
      <p className="sr-only" role="status" aria-live="polite">{processState === 'done' ? 'Server-rendered MP4 ready.' : processState === 'processing' ? STAGES[Math.min(processStage, STAGES.length - 1)] : 'No video processed.'}</p>
    </div>
  );
}
