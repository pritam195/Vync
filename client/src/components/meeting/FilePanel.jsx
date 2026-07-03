import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  ExternalLink,
  FileText,
  Image,
  Info,
  MoreHorizontal,
  Paperclip,
  Presentation,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { absoluteFileUrl, uploadMeetingFile } from '../../services/files.js';

function formatSize(bytes = 0) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fullFileUrl(file) {
  if (!file) {
    return '';
  }

  if (file.absoluteUrl) {
    return file.absoluteUrl;
  }

  if (/^https?:\/\//i.test(file.fileUrl)) {
    return file.fileUrl;
  }

  return absoluteFileUrl(file.fileUrl);
}

function isPdf(file) {
  return file?.fileType === 'application/pdf' || /\.pdf$/i.test(file?.fileName || '');
}

function isImage(file) {
  return file?.fileType?.startsWith('image/');
}

function isVideo(file) {
  return file?.fileType?.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(file?.fileName || '');
}

function isPresentation(file) {
  return /\.(ppt|pptx|pps|ppsx)$/i.test(file?.fileName || '');
}

function isOfficeFile(file) {
  return /\.(doc|docx|ppt|pptx|xls|xlsx)$/i.test(file?.fileName || '');
}

function FileTypeIcon({ file, className = 'h-5 w-5' }) {
  if (isPdf(file)) return <FileText className={className} />;
  if (isImage(file)) return <Image className={className} />;
  if (isVideo(file)) return <Video className={className} />;
  if (isPresentation(file)) return <Presentation className={className} />;
  return <Paperclip className={className} />;
}

function FileViewer({ activeFile, isUploading, onClose, onUploadClick, canUpload }) {
  const fileUrl = fullFileUrl(activeFile);

  if (!activeFile) {
    return (
      <div className="collab-panel flex h-64 flex-col items-center justify-center rounded-2xl border-dashed p-6 text-center opacity-75">
        <FileText className="mb-4 h-10 w-10 text-white/50" />
        <p className="text-sm font-bold text-white">
          Shared file viewer
        </p>
        <p className="mt-1 text-xs font-medium text-white/60">
          Open a file to show it for everyone in the meeting.
        </p>
      </div>
    );
  }

  return (
    <section className="collab-panel overflow-hidden rounded-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-white/10 bg-white/5 p-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <FileTypeIcon file={activeFile} className="h-4 w-4 shrink-0 text-primary" />
            <p className="truncate text-sm font-bold text-white">
              {activeFile.fileName}
            </p>
          </div>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-white/50">
            {formatSize(activeFile.size)} by {activeFile.uploadedBy?.name || 'Guest'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            className="collab-icon-button"
            disabled={!canUpload || isUploading}
            onClick={onUploadClick}
            title={isUploading ? 'Uploading file' : 'Upload another file'}
            type="button"
          >
            <Upload className="h-4 w-4" />
          </button>
          <a className="collab-icon-button" href={fileUrl} rel="noreferrer" target="_blank" title="Open file">
            <ExternalLink className="h-4 w-4" />
          </a>
          <a className="collab-icon-button" download href={fileUrl} title="Download file">
            <Download className="h-4 w-4" />
          </a>
          <button className="collab-icon-button" onClick={onClose} title="Close file" type="button">
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {isPdf(activeFile) ? (
        <iframe
          className="h-[38rem] w-full bg-[#323639]"
          key={activeFile._id}
          src={fileUrl}
          title={activeFile.fileName}
        />
      ) : null}

      {isImage(activeFile) ? (
        <div className="grid min-h-96 place-items-center bg-black/60 p-3 backdrop-blur-xl">
          <img
            alt={activeFile.fileName}
            className="max-h-[34rem] max-w-full rounded object-contain shadow-2xl"
            src={fileUrl}
          />
        </div>
      ) : null}

      {isVideo(activeFile) ? (
        <div className="grid min-h-96 place-items-center bg-black/70 p-3">
          <video
            className="max-h-[34rem] w-full rounded-xl bg-black shadow-2xl"
            controls
            preload="metadata"
            src={fileUrl}
          />
        </div>
      ) : null}

      {!isPdf(activeFile) && !isImage(activeFile) && !isVideo(activeFile) ? (
        <div className="flex min-h-72 flex-col items-center justify-center p-6 text-center">
          {isPresentation(activeFile) ? (
            <Presentation className="mb-4 h-12 w-12 text-primary/70" />
          ) : (
            <Info className="mb-4 h-12 w-12 text-white/30" />
          )}
          <p className="text-sm font-bold text-white">
            {isPresentation(activeFile) ? 'PowerPoint preview opens in a new tab.' : 'Preview is not available for this file type.'}
          </p>
          <p className="mt-2 text-xs font-medium text-white/60">
            {isOfficeFile(activeFile)
              ? 'Office files can be opened or downloaded from the actions below.'
              : 'Open or download the file to view it.'}
          </p>
          <a
            className="mt-6 inline-flex min-h-10 items-center justify-center rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground shadow-glow transition-all hover:scale-105 hover:bg-primary/90 active:scale-95"
            href={fileUrl}
            rel="noreferrer"
            target="_blank"
          >
            Open file
          </a>
        </div>
      ) : null}
    </section>
  );
}

function FilePanel({
  canModerate,
  currentUser,
  localSocketId,
  meetingId,
  onAnnounceUpload,
  onCloseFile,
  onOpenFile,
  permissions,
  sharedFiles,
  sharedFileState,
}) {
  const inputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [contextFileId, setContextFileId] = useState('');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const canUpload = canModerate || permissions?.allowFileShare !== false;
  const activeFile = sharedFileState?.activeFile || null;
  const files = useMemo(() => sharedFiles || [], [sharedFiles]);

  useEffect(() => {
    if (!activeFile && !files.length) {
      setIsUploadOpen(true);
    }
  }, [activeFile, files.length]);

  const handleFileChange = async (event) => {
    const [file] = event.target.files || [];

    if (!file) {
      return;
    }

    setError('');
    setIsUploading(true);

    try {
      const uploadedFile = await uploadMeetingFile(meetingId, file, {
        userId: currentUser?.id || currentUser?._id || '',
        name: currentUser?.name || 'Guest',
        socketId: localSocketId,
      });

      onAnnounceUpload(uploadedFile);
      onOpenFile(uploadedFile, 1);
      setIsUploadOpen(false);
    } catch (uploadError) {
      setError(uploadError.response?.data?.message || 'Could not upload the file');
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <input
        accept=".pdf,.ppt,.pptx,.doc,.docx,image/*,video/*"
        className="hidden"
        onChange={handleFileChange}
        ref={inputRef}
        type="file"
      />

      {isUploadOpen ? (
        <div className="collab-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3">
          <button
            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-glow transition-all hover:bg-primary/90 active:scale-95 disabled:scale-100 disabled:opacity-30 sm:w-auto"
            disabled={!canUpload || isUploading}
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            <Upload className="h-4 w-4" />
            {isUploading ? 'Uploading...' : 'Upload file'}
          </button>
          {!canUpload ? (
            <p className="text-xs font-bold uppercase tracking-wider text-error">
              File sharing is disabled
            </p>
          ) : (
            <p className="text-xs font-semibold text-white/45">PDF, PowerPoint, images, video, and docs</p>
          )}
          {activeFile || files.length ? (
            <button
              className="collab-icon-button"
              onClick={() => setIsUploadOpen(false)}
              title="Hide upload"
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-error/20 bg-error/10 p-3">
          <p className="text-sm font-bold text-error text-center">{error}</p>
        </div>
      ) : null}

      <FileViewer
        activeFile={activeFile}
        canUpload={canUpload}
        isUploading={isUploading}
        onClose={onCloseFile}
        onUploadClick={() => inputRef.current?.click()}
      />

      <section className="meeting-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="mb-3 flex items-center justify-between gap-2 pl-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white/50">Shared files</h3>
          {!isUploadOpen ? (
            <button
              className="inline-flex min-h-8 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground shadow-glow transition hover:bg-primary/90 disabled:opacity-40"
              disabled={!canUpload || isUploading}
              onClick={() => setIsUploadOpen(true)}
              type="button"
            >
              <Upload className="h-3.5 w-3.5" />
              {isUploading ? 'Uploading' : 'Upload'}
            </button>
          ) : null}
        </div>
        <div className="space-y-2 pb-4">
          {files.length ? (
            files.map((file) => (
              <button
                className={`group relative w-full rounded-2xl border p-3 text-left transition-all hover:-translate-y-0.5 ${
                  activeFile?._id === file._id
                    ? 'border-primary/50 bg-primary/20 shadow-glow'
                    : 'border-white/5 bg-black/20 hover:border-white/10 hover:bg-white/5'
                }`}
                key={file._id}
                onClick={() => onOpenFile(file, 1)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setContextFileId(contextFileId === file._id ? '' : file._id);
                }}
                type="button"
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    activeFile?._id === file._id ? 'bg-primary/20 text-primary' : 'bg-white/10 text-white/70'
                  }`}>
                    <FileTypeIcon file={file} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm font-bold ${
                      activeFile?._id === file._id ? 'text-primary' : 'text-white'
                    }`}>
                      {file.fileName}
                    </p>
                    <p className={`mt-0.5 text-[10px] font-medium uppercase tracking-wider ${
                      activeFile?._id === file._id ? 'text-primary/70' : 'text-white/50'
                    }`}>
                      {formatSize(file.size)} by {file.uploadedBy?.name || 'Guest'}
                    </p>
                  </div>
                  <span
                    className="collab-icon-button opacity-0 group-hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      setContextFileId(contextFileId === file._id ? '' : file._id);
                    }}
                    role="button"
                    tabIndex={0}
                    title="File actions"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </span>
                </div>
                {contextFileId === file._id ? (
                  <div className="collab-toolbar absolute right-3 top-12 z-20 grid min-w-36 gap-1 rounded-xl p-1">
                    <a
                      className="ui-menu-item text-white/80"
                      href={fullFileUrl(file)}
                      onClick={(event) => event.stopPropagation()}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open
                    </a>
                    <a
                      className="ui-menu-item text-white/80"
                      download
                      href={fullFileUrl(file)}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </a>
                  </div>
                ) : null}
              </button>
            ))
          ) : (
            <div className="flex h-32 flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/5 opacity-50">
              <p className="text-sm font-bold text-white">
                No files shared yet.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default FilePanel;
