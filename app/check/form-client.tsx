<div style={{
             width: '64px',
             height: '64px',
             borderRadius: '50%',
             backgroundColor: '#10b981',
             display: 'flex',
             alignItems: 'center',
             justifyContent: 'center',
             margin: '0 auto 20px',
             fontSize: '32px',
             color: '#ffffff'
           }}>
             ✓
           </div>
           
           <h2 style={{
             fontSize: '24px',
             fontWeight: '600',
             marginBottom: '12px',
             color: '#1f2937'
           }}>
             Tack Bob!
           </h2>
           
           <p style={{
             fontSize: '16px',
             color: '#6b7280',
             marginBottom: '24px'
           }}>
             Incheckning sparad för {regInput}
           </p>
           
           <button
             onClick={resetForm}
             style={{
               backgroundColor: '#2563eb',
               color: '#ffffff',
               border: 'none',
               borderRadius: '8px',
               padding: '12px 24px',
               fontSize: '16px',
               fontWeight: '500',
               cursor: 'pointer',
               width: '100%'
             }}
           >
             🚗 Starta ny incheckning
           </button>
         </div>
       </div>
     )}
   </div>
 );
}
