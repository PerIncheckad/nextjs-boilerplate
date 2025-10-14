import React, { useEffect, useRef, useState } from "react";

type MediaItem = {
  url: string;
  type: "image" | "video";
  metadata: {
    date: string;
    time?: string;
    damageType: string;
    station: string;
    note?: string;
    inchecker?: string;
    documentationDate?: string;
    damageDate?: string;
  };
};

type MediaModalProps = {
  open: boolean;
  onClose: () => void;
  media: MediaItem[];
  title: string;
  currentIdx?: number;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
};

export default function MediaModal({
  open,
  onClose,
  media,
  title,
  currentIdx = 0,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: MediaModalProps) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (lightboxIdx !== null) {
          setLightboxIdx(null);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, lightboxIdx, onClose]);

  if (!open) return null;

  const currentMedia = media[currentIdx] || media[0];
  if (!currentMedia) {
    // Hanterar fallet där modalen öppnas men ingen media finns (t.ex. för regnr utan bilder)
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
    <div className="media-modal-overlay" ref={modalRef} onClick={onClose}>
      <div className="media-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="media-modal-header">
          <h2 style={{ textAlign: "center", width: "100%" }}>{title}</h2>
          <button className="media-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="media-modal-body">
          <div className="media-modal-gallery">
            {hasPrev && (
              <button className="media-modal-arrow left" onClick={onPrev}>←</button>
            )}
            <div className="media-modal-item">
              {currentMedia.type === "image" ? (
                <img
                  src={currentMedia.url}
                  alt="Skada"
                  className="media-modal-image"
                  onClick={() => setLightboxIdx(currentIdx)}
                />
              ) : (
                <video
                  src={currentMedia.url}
                  controls
                  className="media-modal-video"
                />
              )}
              <div className="media-modal-metadata">
                <div>
                  <b>Datum för dokumentation:</b>{" "}
                  {currentMedia.metadata.documentationDate || currentMedia.metadata.date || "--"}
                  {currentMedia.metadata.time && (
                    <span>
                      <br />
                      <b>Klockslag:</b> kl {currentMedia.metadata.time}
                    </span>
                  )}
                </div>
                {currentMedia.metadata.damageDate && (
                  <div>
                    <b>Skadedatum:</b> {currentMedia.metadata.damageDate}
                  </div>
                )}
                <div>
                  <b>Skadetyp:</b> {currentMedia.metadata.damageType}
                </div>
                <div>
                  <b>Station:</b> {currentMedia.metadata.station}
                </div>
                {currentMedia.metadata.note && (
                  <div style={{ marginTop: "1.2rem", fontStyle: "italic", color: "#444" }}>
                    {currentMedia.metadata.note}
                  </div>
                )}
                {currentMedia.metadata.inchecker && (
                  <div style={{ marginTop: "1.2rem" }}>
                    <b>Incheckare:</b> {currentMedia.metadata.inchecker}
                  </div>
                )}
              </div>
            </div>
            {hasNext && (
              <button className="media-modal-arrow right" onClick={onNext}>→</button>
            )}
          </div>
        </div>
      </div>
      {lightboxIdx !== null && (
        <div className="media-modal-lightbox" onClick={() => setLightboxIdx(null)}>
          <img src={media[lightboxIdx].url} alt="Skada - helskärm" />
        </div>
      )}
      {/* PUNKT 5: Justerad CSS för centrering */}
      <style jsx>{`
        .media-modal-overlay {
          position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
          background: rgba(0, 0, 0, 0.55);
          display: flex; align-items: center; justify-content: center;
          z-index: 9999;
        }
        .media-modal-content {
          background: rgba(255,255,255,0.98); border-radius: 18px;
          padding: 2rem; min-width: 350px; max-width: 95vw; max-height: 90vh;
          overflow-y: auto; box-shadow: 0 2px 32px #0003; position: relative;
        }
        .media-modal-header {
          display: flex; justify-content: center; align-items: center;
          margin-bottom: 1rem; width: 100%;
        }
        .media-modal-close {
          position: absolute; top: 18px; right: 22px; font-size: 2.2rem;
          background: none; border: none; cursor: pointer; color: #333;
        }
        .media-modal-body {
          /* PUNKT 5: Denna container centrerar nu allt innehåll */
          display: flex;
          justify-content: center;
          align-items: center;
        }
        .media-modal-gallery {
          display: flex; align-items: center; justify-content: center;
          gap: 1rem; width: 100%;
        }
        .media-modal-arrow {
          font-size: 2.2rem; background: none; border: none; cursor: pointer;
          color: #005A9C; padding: 0 1rem;
        }
        .media-modal-item {
          display: flex; flex-direction: column; align-items: center;
          text-align: center; /* Centrerar texten i metadata */
        }
        .media-modal-image, .media-modal-video {
          max-width: 480px; max-height: 480px;
          width: 100%; height: auto;
          border-radius: 14px; object-fit: contain;
          margin-bottom: 1rem;
        }
        .media-modal-image { cursor: pointer; }
        .media-modal-metadata { font-size: 1.1rem; color: #1f2937; }
        .media-modal-lightbox {
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0,0,0,0.88); display: flex; align-items: center;
          justify-content: center; z-index: 10000;
        }
        .media-modal-lightbox img {
          max-width: 90vw; max-height: 90vh; border-radius: 16px;
        }
      `}</style>
    </div>
  );
}
