import React from 'react';

type MediaItem = {
  url: string;
  type: 'image' | 'video';
  metadata: {
    regnr: string;
    date: string;
    damageType: string;
    station: string;
  };
};

type MediaModalProps = {
  open: boolean;
  onClose: () => void;
  media: MediaItem[];
  title: string;
  showNoMedia?: boolean;
};

export default function MediaModal({ open, onClose, media, title, showNoMedia }: MediaModalProps) {
  if (!open) return null;

  return (
    <div className="media-modal-overlay">
      <div className="media-modal-content">
        <div className="media-modal-header">
          <h2>{title}</h2>
          <button className="media-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="media-modal-body">
          {showNoMedia ? (
            <div className="media-modal-no-media">Inga bilder/skador.</div>
          ) : (
            <div className="media-modal-gallery">
              {media.map((item, idx) => (
                <div key={idx} className="media-modal-item">
                  {item.type === 'image' ? (
                    <img src={item.url} alt={`Skada på ${item.metadata.regnr}`} className="media-modal-image" />
                  ) : (
                    <video src={item.url} controls className="media-modal-video" />
                  )}
                  <div className="media-modal-metadata">
                    {item.metadata.regnr}, {item.metadata.date}, {item.metadata.damageType}, {item.metadata.station}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <style jsx>{`
        .media-modal-overlay {
          position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
          background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000;
        }
        .media-modal-content {
          background: #fff; border-radius: 12px; padding: 2rem; min-width: 350px; max-width: 95vw; max-height: 90vh; overflow-y: auto;
        }
        .media-modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
        .media-modal-close { font-size: 2rem; background: none; border: none; cursor: pointer; }
        .media-modal-gallery { display: flex; flex-wrap: wrap; gap: 2rem; justify-content: center; }
        .media-modal-item { display: flex; flex-direction: column; align-items: center; margin-bottom: 1rem; }
        .media-modal-image { width: 120px; height: 120px; object-fit: contain; border-radius: 8px; }
        .media-modal-video { width: 120px; height: 120px; border-radius: 8px; }
        .media-modal-metadata { margin-top: 0.5rem; font-size: 1rem; color: #1f2937; }
        .media-modal-no-media { font-size: 1.2rem; color: #888; text-align: center; padding: 2rem 0; }
      `}</style>
    </div>
  );
}
