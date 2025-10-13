import React, { useEffect, useRef, useState } from "react";

type MediaItem = {
  url: string;
  type: "image" | "video";
  metadata: {
    regnr: string;
    date: string;
    time?: string;
    damageType: string;
    station: string;
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

  useEffect(() => {
    if (open) {
      setLightboxIdx(null);
    }
  }, [open, currentIdx]);

  if (!open) return null;

  const currentMedia = media[currentIdx] || media[0];

  return (
    <div className="media-modal-overlay" ref={modalRef}>
      <div className="media-modal-content">
        <div className="media-modal-header">
          <h2>{title}</h2>
          <button className="media-modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="media-modal-body">
          <div className="media-modal-gallery">
            {hasPrev && (
              <button className="media-modal-arrow left" onClick={onPrev}>
                ←
              </button>
            )}
            <div
              className="media-modal-item"
              style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}
            >
              {currentMedia.type === "image" ? (
                <img
                  src={currentMedia.url}
                  alt={`Skada på ${currentMedia.metadata.regnr}`}
                  className="media-modal-image"
                  style={{ cursor: "pointer", maxWidth: "320px", maxHeight: "320px", borderRadius: "8px" }}
                  onClick={() => setLightboxIdx(currentIdx)}
                />
              ) : (
                <video
                  src={currentMedia.url}
                  controls
                  className="media-modal-video"
                  style={{ maxWidth: "320px", maxHeight: "320px", borderRadius: "8px" }}
                />
              )}
              <div className="media-modal-metadata">
                <div>
                  <b>Reg.nr:</b> {currentMedia.metadata.regnr}
                </div>
                <div>
                  <b>Datum:</b> {currentMedia.metadata.date}
                  {currentMedia.metadata.time && (
                    <span>
                      <br />
                      <b>Klockslag:</b> kl {currentMedia.metadata.time}
                    </span>
                  )}
                </div>
                <div>
                  <b>Skadetyp:</b> {currentMedia.metadata.damageType}
                </div>
                <div>
                  <b>Station:</b> {currentMedia.metadata.station}
                </div>
              </div>
            </div>
            {hasNext && (
              <button className="media-modal-arrow right" onClick={onNext}>
                →
              </button>
            )}
          </div>
        </div>
      </div>
      {lightboxIdx !== null && (
        <div className="media-modal-lightbox" onClick={() => setLightboxIdx(null)}>
          <img
            src={media[lightboxIdx].url}
            alt={`Skada på ${media[lightboxIdx].metadata.regnr}`}
            style={{
              maxWidth: "90vw",
              maxHeight: "90vh",
              borderRadius: "16px",
              boxShadow: "0 0 24px #0007",
            }}
          />
        </div>
      )}
      <style jsx>{`
        .media-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0, 0, 0, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
        }
        .media-modal-content {
          background: rgba(255,255,255,0.97);
          border-radius: 18px;
          padding: 2rem;
          min-width: 350px;
          max-width: 95vw;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 2px 32px #0003;
          position: relative;
        }
        .media-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }
        .media-modal-close {
          font-size: 2rem;
          background: none;
          border: none;
          cursor: pointer;
          color: #333;
        }
        .media-modal-gallery {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1.2rem;
        }
        .media-modal-arrow {
          font-size: 2rem;
          background: none;
          border: none;
          cursor: pointer;
          color: #005A9C;
        }
        .media-modal-item {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .media-modal-image,
        .media-modal-video {
          width: 210px;
          height: 210px;
          object-fit: contain;
          border-radius: 8px;
          margin-bottom: 1rem;
        }
        .media-modal-metadata {
          margin-top: 0.5rem;
          font-size: 1rem;
          color: #1f2937;
          text-align: left;
        }
        .media-modal-lightbox {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0,0,0,0.88);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
        }
      `}</style>
    </div>
  );
}
