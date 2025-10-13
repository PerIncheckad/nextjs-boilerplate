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
          <h2 style={{ textAlign: "center", width: "100%" }}>{title}</h2>
          <button className="media-modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="media-modal-body">
          <div className="media-modal-gallery" style={{ justifyContent: "center" }}>
            {hasPrev && (
              <button className="media-modal-arrow left" onClick={onPrev}>
                ←
              </button>
            )}
            <div
              className="media-modal-item"
              style={{
                width: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {currentMedia.type === "image" ? (
                <img
                  src={currentMedia.url}
                  alt="Skada"
                  className="media-modal-image"
                  style={{
                    cursor: "pointer",
                    maxWidth: "480px",
                    maxHeight: "480px",
                    borderRadius: "14px",
                    margin: "0 auto",
                    display: "block",
                  }}
                  onClick={() => setLightboxIdx(currentIdx)}
                />
              ) : (
                <video
                  src={currentMedia.url}
                  controls
                  className="media-modal-video"
                  style={{ maxWidth: "480px", maxHeight: "480px", borderRadius: "14px", margin: "0 auto" }}
                />
              )}
              <div className="media-modal-metadata" style={{ textAlign: "center", marginTop: "1.2rem" }}>
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
            alt="Skada - helskärm"
            style={{
              maxWidth: "90vw",
              maxHeight: "90vh",
              borderRadius: "16px",
              boxShadow: "0 0 24px #0007",
              margin: "0 auto",
              display: "block",
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
          padding: 2.6rem 2rem 2.2rem 2rem;
          min-width: 350px;
          max-width: 95vw;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 2px 32px #0003;
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .media-modal-header {
          display: flex;
          justify-content: center;
          align-items: center;
          margin-bottom: 0.7rem;
          width: 100%;
        }
        .media-modal-close {
          position: absolute;
          top: 18px;
          right: 32px;
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
          gap: 1.3rem;
          width: 100%;
        }
        .media-modal-arrow {
          font-size: 2.2rem;
          background: none;
          border: none;
          cursor: pointer;
          color: #005A9C;
        }
        .media-modal-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 100%;
        }
        .media-modal-image,
        .media-modal-video {
          width: 96%;
          max-width: 480px;
          height: auto;
          object-fit: contain;
          border-radius: 14px;
          margin-bottom: 1rem;
        }
        .media-modal-metadata {
          margin-top: 0.5rem;
          font-size: 1.1rem;
          color: #1f2937;
          text-align: center;
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
