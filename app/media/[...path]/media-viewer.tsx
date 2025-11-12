'use client';
import { useEffect, useState } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

interface MediaFile {
  name: string;
  url: string;
  isImage: boolean;
  isVideo: boolean;
  isFolder: boolean;
  isKommentar: boolean;
}

export default function MediaViewer() {
  const params = useParams();
  const pathname = usePathname();
  const isPublic = pathname?.startsWith('/public-media');
  const basePath = isPublic ? '/public-media' : '/media';

  const path = params.path as string[];
  const folderPath = path ? path.join('/') : '';
  
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kommentarContent, setKommentarContent] = useState<{[key: string]: string}>({});
  const [expandedKommentar, setExpandedKommentar] = useState<string | null>(null);

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

        // Get public URLs for all files and detect folders
        const filesWithUrls: MediaFile[] = data?.map(file => {
          const fullPath = folderPath ? `${folderPath}/${file.name}` : file.name;
          const { data: urlData } = supabase.storage
            .from('damage-photos')
            .getPublicUrl(fullPath);
          
          // Check if it's a folder by looking at metadata
          const isFolder = file.id === null || file.name.endsWith('/');
          const isKommentar = file.name === 'kommentar.txt';
          
          return {
            name: file.name,
            url: urlData.publicUrl,
            isImage: /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name),
            isVideo: /\.(mp4|webm|mov)$/i.test(file.name),
            isFolder,
            isKommentar,
          } as MediaFile;
        }) || [];

        setFiles(filesWithUrls);
        
        // Load kommentar.txt files content in parallel
        const kommentarFiles = filesWithUrls.filter(f => f.isKommentar);
        const kommentarPromises = kommentarFiles.map(async (file) => {
          const fullPath = folderPath ? `${folderPath}/${file.name}` : file.name;
          const { data: downloadData, error: downloadError } = await supabase.storage
            .from('damage-photos')
            .download(fullPath);
          
          if (!downloadError && downloadData) {
            const text = await downloadData.text();
            return { name: file.name, text };
          }
          return null;
        });
        
        const kommentarResults = await Promise.all(kommentarPromises);
        const newKommentarContent: {[key: string]: string} = {};
        kommentarResults.forEach(result => {
          if (result) {
            newKommentarContent[result.name] = result.text;
          }
        });
        setKommentarContent(newKommentarContent);
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

  // Build breadcrumb path
  const pathParts = path || [];
  const breadcrumbs = [
    { name: 'Media', path: basePath, isRoot: true },
    ...pathParts.map((part, idx) => ({
      name: part,
      path: `${basePath}/${pathParts.slice(0, idx + 1).join('/')}`,
      isRoot: false
    }))
  ];

  return (
    <div className="media-viewer">
      <div className="header">
        {/* Breadcrumbs */}
        <div className="breadcrumbs">
          {breadcrumbs.map((crumb, idx) => (
            <span key={idx}>
              {idx > 0 && <span className="separator"> / </span>}
              {idx === breadcrumbs.length - 1 ? (
                <span className="current">{crumb.name}</span>
              ) : (
                <Link href={crumb.path} className="breadcrumb-link">
                  {crumb.name}
                </Link>
              )}
            </span>
          ))}
        </div>
        <p className="file-count">{files.length} objekt</p>
      </div>
      
      <div className="media-grid">
        {files.map((file, idx) => {
          const itemKey = `${folderPath}/${file.name}`;
          
          if (file.isFolder) {
            // Folder card - clickable
            const folderName = file.name.replace(/\/$/, '');
            const nestedPath = path ? `${basePath}/${[...path, folderName].join('/')}` : `${basePath}/${folderName}`;
            
            return (
              <Link href={nestedPath} key={idx} className="media-item folder-item">
                <div className="folder-icon">📁</div>
                <div className="file-name">{folderName}</div>
              </Link>
            );
          }
          
          if (file.isKommentar) {
            // kommentar.txt - click to expand
            const content = kommentarContent[file.name] || '';
            const isExpanded = expandedKommentar === itemKey;
            
            return (
              <div key={idx} className="media-item kommentar-item">
                <div 
                  className="kommentar-header"
                  onClick={() => setExpandedKommentar(isExpanded ? null : itemKey)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="file-icon">📄</div>
                  <div className="file-name">{file.name}</div>
                  <div className="expand-icon">{isExpanded ? '▼' : '▶'}</div>
                </div>
                {isExpanded && content && (
                  <div className="kommentar-content">
                    {content.split('\n').map((line, i) => (
                      <div key={`line-${i}`}>{line || '\u00A0'}</div>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          
          if (file.isImage) {
            // Image - thumbnail that opens full size in new tab
            return (
              <div key={idx} className="media-item">
                <a href={file.url} target="_blank" rel="noopener noreferrer">
                  <img src={file.url} alt={file.name} />
                </a>
                <div className="file-name">{file.name}</div>
              </div>
            );
          }
          
          if (file.isVideo) {
            // Video with controls
            return (
              <div key={idx} className="media-item">
                <video controls>
                  <source src={file.url} />
                  Din webbläsare stöder inte video.
                </video>
                <div className="file-name">{file.name}</div>
              </div>
            );
          }
          
          // Other files
          return (
            <div key={idx} className="media-item">
              <a href={file.url} target="_blank" rel="noopener noreferrer" className="file-link">
                <div className="file-icon">📄</div>
                <div className="file-name">{file.name}</div>
              </a>
            </div>
          );
        })}
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
        .breadcrumbs {
          margin: 0 0 0.5rem;
          font-size: 1rem;
          color: #1f2937;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
        }
        .breadcrumb-link {
          color: #2563eb;
          text-decoration: none;
          transition: color 0.2s;
        }
        .breadcrumb-link:hover {
          color: #1d4ed8;
          text-decoration: underline;
        }
        .breadcrumbs .current {
          color: #1f2937;
          font-weight: 500;
        }
        .breadcrumbs .separator {
          color: #9ca3af;
          margin: 0 0.5rem;
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
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .media-item:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 6px rgba(0,0,0,0.15);
        }
        .folder-item {
          display: block;
          text-decoration: none;
          color: inherit;
          padding: 2rem;
          text-align: center;
          cursor: pointer;
        }
        .folder-icon {
          font-size: 4rem;
          margin-bottom: 1rem;
        }
        .file-icon {
          font-size: 3rem;
          text-align: center;
          padding: 2rem 1rem 1rem;
        }
        .media-item img,
        .media-item video {
          width: 100%;
          height: auto;
          display: block;
        }
        .media-item a {
          display: block;
        }
        .file-name {
          padding: 0.75rem;
          font-size: 0.875rem;
          color: #374151;
          border-top: 1px solid #e5e7eb;
          word-break: break-all;
        }
        .folder-item .file-name {
          border-top: none;
          font-weight: 500;
          color: #1f2937;
        }
        .kommentar-item {
          display: block;
        }
        .kommentar-header {
          display: flex;
          align-items: center;
          padding: 1rem;
          background: #fef3c7;
        }
        .kommentar-header .file-icon {
          padding: 0;
          font-size: 2rem;
          margin-right: 0.5rem;
        }
        .kommentar-header .file-name {
          flex: 1;
          padding: 0;
          border: none;
          font-weight: 500;
        }
        .kommentar-header .expand-icon {
          font-size: 1.2rem;
          color: #92400e;
        }
        .kommentar-content {
          padding: 1rem;
          background: #fffbeb;
          border-top: 1px solid #fbbf24;
          font-family: monospace;
          font-size: 0.875rem;
          white-space: pre-wrap;
          color: #78350f;
        }
        .file-link {
          display: block;
          text-decoration: none;
          color: inherit;
          text-align: center;
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
