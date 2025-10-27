'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

interface MediaFile {
  name: string;
  url: string;
  isImage: boolean;
  isVideo: boolean;
}

export default function MediaViewer() {
  const params = useParams();
  const path = params.path as string[];
  const folderPath = path ? path.join('/') : '';
  
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadMedia = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        
        // List files in the folder
        const { data, error: listError } = await supabase.storage
          .from('damage-photos')
          .list(folderPath, {
            limit: 100,
            sortBy: { column: 'name', order: 'asc' }
          });

        if (listError) throw listError;

        // Get public URLs for all files
        const filesWithUrls: MediaFile[] = data?.filter(file => !file.name.endsWith('/'))
          .map(file => {
            const fullPath = folderPath ? `${folderPath}/${file.name}` : file.name;
            const { data: urlData } = supabase.storage
              .from('damage-photos')
              .getPublicUrl(fullPath);
            
            return {
              name: file.name,
              url: urlData.publicUrl,
              isImage: /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name),
              isVideo: /\.(mp4|webm|mov)$/i.test(file.name),
            } as MediaFile;
          }) || [];

        setFiles(filesWithUrls);
      } catch (err: any) {
        setError(err.message || 'Failed to load media');
        console.error('Media load error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadMedia();
  }, [folderPath]);

  if (loading) {
    return (
      <div className="media-viewer">
        <div className="loading">Laddar media...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="media-viewer">
        <div className="error">Fel: {error}</div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="media-viewer">
        <div className="empty">Inga filer hittades i denna mapp.</div>
      </div>
    );
  }

  return (
    <div className="media-viewer">
      <div className="header">
        <h1>Media: {folderPath || 'Root'}</h1>
        <p className="file-count">{files.length} fil(er)</p>
      </div>
      
      <div className="media-grid">
        {files.map((file, idx) => (
          <div key={idx} className="media-item">
            {file.isImage && (
              <img src={file.url} alt={file.name} />
            )}
            {file.isVideo && (
              <video controls>
                <source src={file.url} />
                Din webbläsare stöder inte video.
              </video>
            )}
            <div className="file-name">{file.name}</div>
          </div>
        ))}
      </div>

      <style jsx>{`
        .media-viewer {
          min-height: 100vh;
          background: #f9fafb;
          padding: 2rem;
        }
        .header {
          max-width: 1200px;
          margin: 0 auto 2rem;
          background: white;
          padding: 1.5rem;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .header h1 {
          margin: 0 0 0.5rem;
          font-size: 1.5rem;
          color: #1f2937;
        }
        .file-count {
          margin: 0;
          color: #6b7280;
          font-size: 0.875rem;
        }
        .media-grid {
          max-width: 1200px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 1.5rem;
        }
        .media-item {
          background: white;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .media-item img,
        .media-item video {
          width: 100%;
          height: auto;
          display: block;
        }
        .file-name {
          padding: 0.75rem;
          font-size: 0.875rem;
          color: #374151;
          border-top: 1px solid #e5e7eb;
          word-break: break-all;
        }
        .loading,
        .error,
        .empty {
          max-width: 600px;
          margin: 4rem auto;
          text-align: center;
          padding: 2rem;
          background: white;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .error {
          color: #dc2626;
        }
      `}</style>
    </div>
  );
}
