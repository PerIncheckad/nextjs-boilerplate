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
      return <div className="loading-message">Hämtar media...</div>;
    }
    if (!currentMedia) {
      return <div className="loading-message">Ingen media att visa för denna skada.</div>;
    }
    return (
      <div className="modal-content-wrapper">
        <div className="media-container">
          {currentMedia.type === "image" ? (
            <img 
              src={currentMedia.url} 
              alt="Skada" 
              onClick={() => setLightboxOpen(true)}
              className="media-content"
            />
          ) : (
            <video 
              src={currentMedia.url} 
              controls 
              className="media-content"
            />
          )}
        </div>
        
        <div className="navigation-container">
          {(hasPrev || hasNext) && (
            <div className="arrow-container">
              <button 
                className="navigation-arrow prev-arrow" 
                onClick={onPrev} 
                disabled={!hasPrev}
                aria-label="Föregående"
              >
                ←
              </button>
              <div className="pagination-indicator">{currentIdx + 1} / {media.length}</div>
              <button 
                className="navigation-arrow next-arrow" 
                onClick={onNext} 
                disabled={!hasNext}
                aria-label="Nästa"
              >
                →
              </button>
            </div>
          )}
        </div>
        
        <div className="metadata-container">
          <div><b>Datum för dokumentation:</b> {currentMedia.metadata.documentationDate || "--"}</div>
          {currentMedia.metadata.time && <div><b>Klockslag:</b> kl {currentMedia.metadata.time}</div>}
          {currentMedia.metadata.damageDate && <div><b>Skadedatum:</b> {currentMedia.metadata.damageDate}</div>}
          <div><b>Skadetyp:</b> {currentMedia.metadata.damageType}</div>
          <div><b>Station:</b> {currentMedia.metadata.station}</div>
          {currentMedia.metadata.note && <div className="note">"{currentMedia.metadata.note}"</div>}
          {currentMedia.metadata.generalNote && <div className="note general-note"><b>Allmän kommentar:</b> "{currentMedia.metadata.generalNote}"</div>}
          {currentMedia.metadata.inchecker && <div className="inchecker-info"><b>Incheckare:</b> {currentMedia.metadata.inchecker}</div>}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-container" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2 className="modal-title">{title}</h2>
            <button className="close-button" onClick={onClose}>×</button>
          </div>
          
          <div className="modal-body">
            {renderContent()}
          </div>
        </div>
      </div>
      
      {lightboxOpen && currentMedia && (
        <div className="lightbox-overlay" onClick={() => setLightboxOpen(false)}>
          <img src={currentMedia.url} alt="Skada - helskärm" className="lightbox-image" />
          <button className="lightbox-close" onClick={() => setLightboxOpen(false)}>×</button>
        </div>
      )}

      <style jsx>{`
        /* Modal Overlay */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.75);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
        }
        
        /* Modal Container */
        .modal-container {
          background-color: white;
          border-radius: 8px;
          width: 600px;
          height: 650px;
          max-width: 90vw;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        
        /* Modal Header */
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid #e0e0e0;
        }
        
        .modal-title {
          margin: 0;
          font-size: 18px;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .close-button {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          padding: 0 8px;
        }
        
        /* Modal Body */
        .modal-body {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        
        .modal-content-wrapper {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        
        /* Media Container */
        .media-container {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          background-color: #f5f5f5;
          max-height: 350px;
          overflow: hidden;
        }
        
        .media-content {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          cursor: pointer;
        }
        
        /* Navigation Container */
        .navigation-container {
          display: flex;
          justify-content: center;
          padding: 8px 0;
          border-top: 1px solid #f0f0f0;
          border-bottom: 1px solid #f0f0f0;
        }
        
        .arrow-container {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
        }
        
        .navigation-arrow {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 1px solid #e0e0e0;
          background: white;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 18px;
          transition: all 0.2s;
        }
        
        .navigation-arrow:hover:not(:disabled) {
          background-color: #f5f5f5;
        }
        
        .navigation-arrow:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        
        .pagination-indicator {
          font-size: 14px;
          color: #666;
        }
        
        /* Metadata Container */
        .metadata-container {
          flex: 1;
          padding: 16px;
          overflow-y: auto;
          font-size: 14px;
        }
        
        .metadata-container div {
          margin-bottom: 6px;
        }
        
        .note {
          margin-top: 12px;
          font-style: italic;
          color: #555;
          border-left: 3px solid #e0e0e0;
          padding-left: 12px;
        }
        
        .general-note {
          margin-top: 8px;
          color: #666;
        }
        
        .inchecker-info {
          margin-top: 12px;
          font-size: 13px;
          color: #666;
        }
        
        /* Loading State */
        .loading-message {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          font-size: 16px;
          color: #666;
        }
        
        /* Lightbox */
        .lightbox-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.9);
          z-index: 1100;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .lightbox-image {
          max-width: 90%;
          max-height: 90%;
        }
        
        .lightbox-close {
          position: absolute;
          top: 20px;
          right: 20px;
          background: none;
          border: none;
          color: white;
          font-size: 32px;
          cursor: pointer;
        }
      `}</style>
    </>
  );
}
