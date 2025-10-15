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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (lightboxOpen) setLightboxOpen(false);
        else onClose();
      }
      if (e.key === "ArrowLeft" && onPrev && hasPrev) {
        onPrev();
      }
      if (e.key === "ArrowRight" && onNext && hasNext) {
        onNext();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, lightboxOpen, onClose, onPrev, onNext, hasPrev, hasNext]);

  if (!open) return null;

  const currentMedia = media[currentIdx];

  const renderContent = () => {
    if (isLoading) {
      return <div className="media-modal-status-text">Hämtar media...</div>;
    }
    if (!currentMedia) {
      return <div className="media-modal-status-text">Ingen media att visa för denna skada.</div>;
    }
    return (
      <div className="media-modal-inner-content">
        <div className="media-container">
          {currentMedia.type === "image" ? (
            <img src={currentMedia.url} alt="Skada" className="media-modal-media" onClick={() => setLightboxOpen(true)} />
          ) : (
            <video src={currentMedia.url} controls className="media-modal-media" />
          )}
        </div>

        <div className="bottom-section">
          {(hasPrev || hasNext) && (
            <div className="arrow-container">
              <button className="media-modal-arrow" onClick={onPrev} disabled={!hasPrev} aria-label="Föregående">
                <span className="arrow-shape left" />
              </button>
              <span>{currentIdx + 1} / {media.length}</span>
              <button className="media-modal-arrow" onClick={onNext} disabled={!hasNext} aria-label="Nästa">
                <span className="arrow-shape right" />
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
            <h2 className="modal-title-text">{title}</h2>
            <button className="media-modal-close" onClick={onClose}>×</button>
          </div>
          <div className="media-modal-body">
            {renderContent()}
          </div>
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
          background: rgba(0, 0, 0, 0.65);
          display: flex; align-items: center; justify-content: center; z-index: 9999;
          padding: 2rem;
        }
        .media-modal-content {
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 5px 25px rgba(0,0,0,0.2);
          width: 600px; /* Fast bredd */
          max-width: 100%;
          height: 90vh; /* Justerad höjd */
          max-height: 800px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .media-modal-header {
          padding: 1rem 2rem;
          text-align: center;
          border-bottom: 1px solid #e5e7eb;
          position: relative;
          flex-shrink: 0;
        }
        .modal-title-text {
          margin: 0;
          font-size: 1.25rem;
          color: #111827;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .media-modal-close {
          position: absolute; top: 50%; right: 20px;
          transform: translateY(-50%);
          font-size: 2.5rem;
          background: none; border: none; cursor: pointer;
          color: #6b7280; line-height: 1; padding: 0;
        }
        .media-modal-close:hover { color: #111827; }
        .media-modal-body {
          flex-grow: 1;
          padding: 1.5rem;
          overflow: hidden;
          display: flex;
        }
        .media-modal-status-text {
            flex-grow: 1; display: flex; align-items: center; justify-content: center;
            font-size: 1.2rem; color: #6b7280;
        }
        .media-modal-inner-content {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
        }
        .media-container {
          width: 100%;
          min-height: 200px; /* Minimum höjd för bilden */
          flex-grow: 1; /* TAR UPP RESTEN AV PLATSEN */
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: #f3f4f6;
          border-radius: 12px;
          overflow: hidden;
          margin-bottom: 1rem;
        }
        .media-modal-media {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          border-radius: 4px;
        }
        .media-modal-media[src$=".jpeg"], .media-modal-media[src$=".png"] {
            cursor: pointer;
        }
        .bottom-section {
            flex-shrink: 0;
            overflow-y: auto;
            max-height: 40%; /* Max 40% av utrymmet för botten-sektionen */
            padding-right: 1rem; /* Utrymme för scrollbar */
        }
        .arrow-container {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 1.5rem;
          padding: 0.5rem 0 1rem 0;
          width: 100%;
        }
        .media-modal-arrow {
          background: #fff;
          border: 1px solid #d1d5db;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
          color: #4b5563;
        }
        .media-modal-arrow:hover:not(:disabled) {
          border-color: #9ca3af;
          background-color: #f9fafb;
          color: #1f2937;
        }
        .media-modal-arrow:disabled {
          cursor: not-allowed;
          background-color: #f9fafb;
          color: #d1d5db;
        }
        .arrow-shape {
          border: solid currentColor;
          border-width: 0 2px 2px 0;
          display: inline-block;
          padding: 4px;
        }
        .arrow-shape.left { transform: rotate(135deg); }
        .arrow-shape.right { transform: rotate(-45deg); }

        .media-modal-metadata {
          font-size: 1rem; color: #374151;
          text-align: left; width: 100%;
          line-height: 1.5;
        }
        .media-modal-metadata div { margin-bottom: 0.25rem; }
        .note { margin-top: 0.75rem; font-style: italic; color: #1f2937; border-left: 3px solid #e5e7eb; padding-left: 0.75rem;}
        .general-note { margin-top: 0.5rem; color: #4b5563; font-style: normal; }
        
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
