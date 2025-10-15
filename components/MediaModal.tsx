import React, { useEffect, useState } from "react";

type MediaItem = {
  url: string;
  type: "image" | "video";
  metadata: {
    date: string; time?: string; damageType: string; station: string; 
    note?: string; generalNote?: string; inchecker?: string; 
    documentationDate?: string; damageDate?: string;
  };
};

type MediaModalProps = {
  open: boolean; onClose: () => void; media: MediaItem[]; title: string;
  currentIdx?: number; onPrev?: () => void; onNext?: () => void;
  hasPrev?: boolean; hasNext?: boolean; isLoading?: boolean;
};

export default function MediaModal({
  open, onClose, media, title, currentIdx = 0, onPrev, onNext, hasPrev, hasNext, isLoading
}: MediaModalProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (lightboxOpen) setLightboxOpen(false);
        else onClose();
      }
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, lightboxOpen, onClose]);

  if (!open) return null;

  const currentMedia = media[currentIdx];

  const renderContent = () => {
    if (isLoading) {
      return <div className="media-modal-body" style={{ padding: '2rem', textAlign: 'center' }}>Hämtar media...</div>;
    }
    if (!currentMedia) {
      return <div className="media-modal-body" style={{ padding: '2rem', textAlign: 'center' }}>Ingen media att visa för denna skada.</div>;
    }
    return (
      <div className="media-modal-body">
        <div className="media-modal-item">
          <div className="media-container">
            {currentMedia.type === "image" ? (
              <img src={currentMedia.url} alt="Skada" className="media-modal-media" onClick={() => setLightboxOpen(true)} />
            ) : (
              <video src={currentMedia.url} controls className="media-modal-media" />
            )}
          </div>
          
          {(hasPrev || hasNext) && (
            <div className="arrow-container">
              <button className="media-modal-arrow left" onClick={onPrev} disabled={!hasPrev}>←</button>
              <span>{currentIdx + 1} / {media.length}</span>
              <button className="media-modal-arrow right" onClick={onNext} disabled={!hasNext}>→</button>
            </div>
          )}

          <div className="media-modal-metadata">
            <div><b>Datum för dokumentation:</b> {currentMedia.metadata.documentationDate || "--"}</div>
            {currentMedia.metadata.time && <div><b>Klockslag:</b> kl {currentMedia.metadata.time}</div>}
            {currentMedia.metadata.damageDate && <div><b>Skadedatum:</b> {currentMedia.metadata.damageDate}</div>}
            <div><b>Skadetyp:</b> {currentMedia.metadata.damageType}</div>
            <div><b>Station:</b> {currentMedia.metadata.station}</div>
            {currentMedia.metadata.note && <div className="note">"{currentMedia.metadata.note}"</div>}
            {currentMedia.metadata.generalNote && <div className="note general-note"><b>Allmän kommentar:</b> "{currentMedia.metadata.generalNote}"</div>}
            {currentMedia.metadata.inchecker && <div style={{ marginTop: "1rem" }}><b>Incheckare:</b> {currentMedia.metadata.inchecker}</div>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="media-modal-overlay" onClick={onClose}>
        <div className="media-modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="media-modal-header">
            <h2 style={{ textAlign: "center", width: "100%" }}>{title}</h2>
            <button className="media-modal-close" onClick={onClose}>×</button>
          </div>
          {renderContent()}
        </div>
      </div>
      {lightboxOpen && currentMedia && (
        <div className="media-modal-lightbox" onClick={() => setLightboxOpen(false)}>
          <img src={currentMedia.url} alt="Skada - helskärm" />
        </div>
      )}
      <style jsx>{`
        .media-modal-overlay { /* ... befintlig stil ... */ }
        .media-modal-content { /* ... befintlig stil ... */ }
        .media-modal-header { /* ... befintlig stil ... */ }
        .media-modal-close { /* ... befintlig stil ... */ }
        .media-modal-body { display: flex; justify-content: center; }
        .media-modal-item { display: flex; flex-direction: column; align-items: center; }

        /* NYTT: Fast storlek för mediakontainer */
        .media-container {
          width: 500px;
          height: 500px;
          max-width: 80vw;
          max-height: 60vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: #e5e7eb;
          border-radius: 14px;
          margin-bottom: 1rem;
        }
        .media-modal-media {
          max-width: 100%;
          max-height: 100%;
          width: auto;
          height: auto;
          object-fit: contain;
          border-radius: 14px;
        }
        .media-modal-media[src$=".mp4"], .media-modal-media[src$=".mov"] {
            width: 100%; /* Låt video fylla ut bredden */
        }
        .media-modal-image { cursor: pointer; }
        
        .arrow-container { /* ... befintlig stil ... */ }
        .media-modal-arrow { /* ... befintlig stil ... */ }
        .media-modal-metadata {
          font-size: 1.1rem; color: #1f2937; margin-top: 1rem;
          text-align: left; width: 100%; max-width: 500px;
        }
        .media-modal-metadata div { margin-bottom: 0.25rem; }
        .note { margin-top: 1rem; font-style: italic; color: #444; }
        .general-note { margin-top: 0.5rem; color: #555; font-style: normal;}

        .media-modal-lightbox { /* ... befintlig stil ... */ }
        .media-modal-lightbox img { /* ... befintlig stil ... */ }
      `}</style>
    </>
  );
}
