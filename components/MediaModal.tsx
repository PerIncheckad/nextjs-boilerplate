import React, { useEffect, useRef, useState } from "react";

// Typer (inga ändringar)
type MediaItem = {
  url: string;
  type: "image" | "video";
  metadata: {
    date: string; time?: string; damageType: string; station: string; note?: string;
    inchecker?: string; documentationDate?: string; damageDate?: string;
  };
};

type MediaModalProps = {
  open: boolean; onClose: () => void; media: MediaItem[]; title: string;
  currentIdx?: number; onPrev?: () => void; onNext?: () => void;
  hasPrev?: boolean; hasNext?: boolean;
};

export default function MediaModal({
  open, onClose, media, title, currentIdx = 0, onPrev, onNext, hasPrev, hasNext,
}: MediaModalProps) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") lightboxIdx !== null ? setLightboxIdx(null) : onClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, lightboxIdx, onClose]);

  if (!open) return null;
  const currentMedia = media[currentIdx];

  if (!currentMedia) {
    return (
      <div className="media-modal-overlay" onClick={onClose}>
        <div className="media-modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="media-modal-header">
            <h2 style={{ textAlign: "center", width: "100%" }}>{title}</h2>
            <button className="media-modal-close" onClick={onClose}>×</button>
          </div>
          <div className="media-modal-body" style={{ padding: '2rem', textAlign: 'center' }}>
            Ingen media att visa.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="media-modal-overlay" onClick={onClose}>
      <div className="media-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="media-modal-header">
          <h2 style={{ textAlign: "center", width: "100%" }}>{title}</h2>
          <button className="media-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="media-modal-body">
          <div className="media-modal-item">
            {currentMedia.type === "image" ? (
              <img src={currentMedia.url} alt="Skada" className="media-modal-image" onClick={() => setLightboxIdx(currentIdx)} />
            ) : (
              <video src={currentMedia.url} controls className="media-modal-video" />
            )}
            
            {/* ÅTGÄRD: Pilar under bilden */}
            {(hasPrev || hasNext) && (
              <div className="arrow-container">
                <button className="media-modal-arrow left" onClick={onPrev} disabled={!hasPrev}>←</button>
                <span>{currentIdx + 1} / {media.length}</span>
                <button className="media-modal-arrow right" onClick={onNext} disabled={!hasNext}>→</button>
              </div>
            )}

            {/* ÅTGÄRD: Metadata-texten är nu vänsterställd */}
            <div className="media-modal-metadata">
              <div><b>Datum för dokumentation:</b> {currentMedia.metadata.documentationDate || currentMedia.metadata.date || "--"}</div>
              {currentMedia.metadata.time && <div><b>Klockslag:</b> kl {currentMedia.metadata.time}</div>}
              {currentMedia.metadata.damageDate && <div><b>Skadedatum:</b> {currentMedia.metadata.damageDate}</div>}
              <div><b>Skadetyp:</b> {currentMedia.metadata.damageType}</div>
              <div><b>Station:</b> {currentMedia.metadata.station}</div>
              {currentMedia.metadata.note && <div className="note">"{currentMedia.metadata.note}"</div>}
              {currentMedia.metadata.inchecker && <div style={{ marginTop: "1rem" }}><b>Incheckare:</b> {currentMedia.metadata.inchecker}</div>}
            </div>
          </div>
        </div>
      </div>
      {lightboxIdx !== null && (
        <div className="media-modal-lightbox" onClick={() => setLightboxIdx(null)}>
          <img src={media[lightboxIdx].url} alt="Skada - helskärm" />
        </div>
      )}
      <style jsx>{`
        .media-modal-overlay {
          position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
          background: rgba(0, 0, 0, 0.55);
          display: flex; align-items: center; justify-content: center; z-index: 9999;
        }
        .media-modal-content {
          background: rgba(255,255,255,0.98); border-radius: 18px;
          padding: 2rem; min-width: 350px; max-width: 95vw; max-height: 90vh;
          overflow-y: auto; box-shadow: 0 2px 32px #0003; position: relative;
        }
        .media-modal-header {
          text-align: center; margin-bottom: 1rem; width: 100%;
        }
        .media-modal-close {
          position: absolute; top: 18px; right: 22px; font-size: 2.2rem;
          background: none; border: none; cursor: pointer; color: #333;
        }
        .media-modal-body { display: flex; justify-content: center; }
        .media-modal-item { display: flex; flex-direction: column; align-items: center; }
        .media-modal-image, .media-modal-video {
          max-width: 480px; max-height: 480px; width: 100%; height: auto;
          border-radius: 14px; object-fit: contain;
        }
        .media-modal-image { cursor: pointer; }
        .arrow-container {
          display: flex; justify-content: center; align-items: center;
          gap: 1.5rem; margin: 1rem 0;
        }
        .media-modal-arrow {
          font-size: 2rem; background: none; border: none; cursor: pointer; color: #005A9C;
        }
        .media-modal-arrow:disabled { color: #ccc; cursor: not-allowed; }
        .media-modal-metadata {
          font-size: 1.1rem; color: #1f2937; margin-top: 1rem;
          text-align: left; /* Vänsterställd text */
          width: 100%; max-width: 480px;
        }
        .media-modal-metadata div { margin-bottom: 0.25rem; }
        .note { margin-top: 1rem; font-style: italic; color: #444; }
        .media-modal-lightbox {
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0,0,0,0.88); display: flex; align-items: center;
          justify-content: center; z-index: 10000;
        }
        .media-modal-lightbox img { max-width: 90vw; max-height: 90vh; border-radius: 16px; }
      `}</style>
    </div>
  );
}
