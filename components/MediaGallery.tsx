import React, { useState } from 'react';
import MediaModal from './MediaModal';

type Skada = {
  regnr: string;
  damageType: string;
  date: string;
  station: string;
  media: { url: string; type: 'image' | 'video' }[];
  isLatest: boolean;
};

type MediaGalleryProps = {
  skador: Skada[];
  role: 'admin' | 'bilkontroll' | 'biluthyrare' | 'incheckare';
};

export default function MediaGallery({ skador, role }: MediaGalleryProps) {
  const [openModalIdx, setOpenModalIdx] = useState<number|null>(null);

  const canViewHistory = role === 'admin' || role === 'bilkontroll' || role === 'biluthyrare';

  const handleOpenModal = (idx: number) => setOpenModalIdx(idx);
  const handleCloseModal = () => setOpenModalIdx(null);

  return (
    <div className="media-gallery">
      <h1>Galleri för skador</h1>
      <div className="media-gallery-list">
        {skador.map((skada, idx) => (
          <div key={idx} className="media-gallery-skada">
            <div className="media-gallery-skada-header">
              {skada.isLatest
                ? `${skada.regnr} - Senaste skada: ${skada.damageType} - ${skada.date}`
                : `${skada.regnr} - ${skada.damageType} - ${skada.date}`}
            </div>
            <div className="media-gallery-thumbs">
              {skada.media.length ? (
                skada.media.map((item, mIdx) => (
                  <img
                    key={mIdx}
                    src={item.url}
                    alt={skada.damageType}
                    className="media-gallery-thumb"
                    title={`${skada.regnr}, ${skada.date}, ${skada.damageType}, ${skada.station}`}
                    onClick={() => handleOpenModal(idx)}
                  />
                ))
              ) : (
                <button onClick={() => handleOpenModal(idx)}>Visa skada</button>
              )}
            </div>
            {/* Modal per skada */}
            {openModalIdx === idx && (
              <MediaModal
                open={true}
                onClose={handleCloseModal}
                media={skada.media.map(mediaItem => ({
                  ...mediaItem,
                  metadata: {
                    regnr: skada.regnr,
                    date: skada.date,
                    damageType: skada.damageType,
                    station: skada.station,
                  },
                }))}
                title={
                  skada.isLatest
                    ? `${skada.regnr} - Senaste skada: ${skada.damageType} - ${skada.date}`
                    : `${skada.regnr} - ${skada.damageType} - ${skada.date}`
                }
                showNoMedia={skada.media.length === 0}
              />
            )}
          </div>
        ))}
      </div>
      <style jsx>{`
        .media-gallery { max-width: 900px; margin: 0 auto; padding: 2rem; }
        .media-gallery-list { display: flex; flex-direction: column; gap: 2rem; }
        .media-gallery-skada { border-bottom: 1px solid #eee; padding-bottom: 2rem; }
        .media-gallery-skada-header { font-weight: bold; margin-bottom: 1rem; }
        .media-gallery-thumbs { display: flex; gap: 2rem; }
        .media-gallery-thumb {
          width: 180px; height: 180px; object-fit: contain; border-radius: 10px; cursor: pointer;
          border: 2px solid #b0b4b8; transition: box-shadow 0.1s;
        }
        .media-gallery-thumb:hover { box-shadow: 0 0 10px #005A9C; }
      `}</style>
    </div>
  );
}
