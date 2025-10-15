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

const ArrowLeftIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

const ArrowRightIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18l6-6-6-6" />
  </svg>
);


export default function MediaModal({
  open, onClose, media, title, currentIdx = 0, onPrev, onNext, hasPrev, hasNext, isLoading
}: MediaModalProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (lightboxOpen) setLightboxOpen(false);
        else onClose();
      }
      // NYTT: Tangentbordsnavigering
      if (e.key === "ArrowLeft" && onPrev) {
        onPrev();
      }
      if (e.key === "ArrowRight" && onNext) {
        onNext();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, lightboxOpen, onClose, onPrev, onNext]);

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
              <button className="media-modal-arrow" onClick={onPrev} disabled={!hasPrev} aria-label="Föregående">
                <ArrowLeftIcon />
              </button>
              <span>{currentIdx + 1} / {media.length}</span>
              <button className="media-modal-arrow" onClick={onNext} disabled={!hasNext} aria-label="Nästa">
                <ArrowRightIcon />
              </button>
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
        .media-modal-overlay {
          position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
          background: rgba(0, 0, 0, 0.6);
          display: flex; align-items: center; justify-content: center; z-index: 9999;
        }
        .media-modal-content {
          background: #fff; border-radius: 18px;
          padding: 2rem; min-width: 350px; max-width: 95vw; max-height: 95vh;
          overflow-y: auto; box-shadow: 0 4px 32px rgba(0,0,0,0.15); position: relative;
          display: flex; flex-direction: column;
        }
        .media-modal-header {
          text-align: center; margin-bottom: 1rem; width: 100%; flex-shrink: 0;
        }
        .media-modal-close {
          position: absolute; top: 18px; right: 22px; font-size: 2.2rem;
          background: none; border: none; cursor: pointer; color: #333; line-height: 1;
        }
        .media-modal-body { display: flex; justify-content: center; flex-grow: 1; }
        .media-modal-item { display: flex; flex-direction: column; align-items: center; }
        
        .media-container {
          width: 100%;
          max-width: 500px; /* Striktare maxbredd */
          height: 500px;    /* Strikt maxhöjd */
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: #f0f2f5;
          border-radius: 14px;
          margin-bottom: 1rem;
          flex-shrink: 0;
        }
        .media-modal-media {
          max-width: 100%;
          max-height: 100%;
          width: auto;
          height: auto;
          object-fit: contain;
          border-radius: 8px;
        }
        .media-modal-media[src$=".mp4"], .media-modal-media[src$=".mov"] {
            width: 100%;
        }
        .media-modal-media[src$=".jpeg"], .media-modal-media[src$=".png"] {
            cursor: pointer;
        }

        .arrow-container {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 1.5rem;
          margin: 0.5rem 0;
          width: 100%;
        }
        .media-modal-arrow {
          background: #fff;
          border: 1px solid #d1d5db;
          border-radius: 50%;
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          color: #374151;
        }
        .media-modal-arrow:hover:not(:disabled) {
          border-color: #9ca3af;
          background-color: #f9fafb;
          color: #000;
        }
        .media-modal-arrow:disabled {
          cursor: not-allowed;
          background-color: #f3f4f6;
          color: #9ca3af;
          opacity: 0.7;
        }

        .media-modal-metadata {
          font-size: 1.05rem; color: #1f2937; margin-top: 1.5rem;
          text-align: left; width: 100%; max-width: 500px;
          line-height: 1.6;
        }
        .media-modal-metadata div { margin-bottom: 0.3rem; }
        .note { margin-top: 1rem; font-style: italic; color: #374151; border-left: 3px solid #d1d5db; padding-left: 1rem;}
        .general-note { margin-top: 0.75rem; color: #4b5563; font-style: normal; }
        
        .media-modal-lightbox {
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0,0,0,0.88); display: flex; align-items: center;
          justify-content: center; z-index: 10000;
        }
        .media-modal-lightbox img { max-width: 90vw; max-height: 90vh; border-radius: 8px; }
      `}</style>
    </>
  );
}
